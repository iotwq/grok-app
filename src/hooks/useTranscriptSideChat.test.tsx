// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import { IDLE_SNAPSHOT, type SessionSnapshot } from "@/lib/session";
import { useTranscriptSideChat } from "./useTranscriptSideChat";

vi.mock("@/lib/api", () => ({
  listen: vi.fn(),
  sessionCreate: vi.fn(),
  sessionConnect: vi.fn(),
  sessionSend: vi.fn(),
  sessionStop: vi.fn(),
  sessionMessages: vi.fn(),
}));
const handlers = new Map<string, (payload: unknown) => void>();
const ready: SessionSnapshot = {
  ...IDLE_SNAPSHOT,
  sessionId: "side-1",
  state: "ready",
};
const quote = {
  id: "quote-1",
  text: "Selected output",
  comment: "",
  sourceMessageId: "main-answer",
};
const project = {
  id: "project-1",
  name: "Project",
  path: "/project",
  trusted: true,
  pathOk: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  handlers.clear();
  vi.mocked(api.listen).mockImplementation(async (name, fn) => {
    handlers.set(name, fn as (payload: unknown) => void);
    return () => {
      handlers.delete(name);
    };
  });
  vi.mocked(api.sessionCreate).mockResolvedValue({
    id: "side-1",
    projectId: "project-1",
    title: "Side chat",
    updatedAt: "",
  });
  vi.mocked(api.sessionConnect).mockResolvedValue(ready);
  vi.mocked(api.sessionSend).mockResolvedValue({
    ...ready,
    state: "streaming",
  });
  vi.mocked(api.sessionStop).mockResolvedValue(ready);
  vi.mocked(api.sessionMessages).mockResolvedValue([]);
});
afterEach(cleanup);

function emit(event: string, payload: unknown) {
  act(() => {
    handlers.get(event)?.(payload);
  });
}

describe("side chat session routing", () => {
  it("creates only on send, targets its own session, and preserves structured quotes", async () => {
    const { result } = renderHook(() =>
      useTranscriptSideChat(project, "/project/worktree"),
    );
    expect(api.sessionCreate).not.toHaveBeenCalled();
    await act(async () => {
      expect(
        await result.current.send("Explain this", [quote], "Side chat"),
      ).toBe(true);
    });
    expect(api.sessionCreate).toHaveBeenCalledWith("project-1", "Side chat");
    expect(api.sessionConnect).toHaveBeenCalledWith({
      sessionId: "side-1",
      projectPath: "/project/worktree",
      sshAlias: undefined,
      mode: "ask",
    });
    expect(api.sessionSend).toHaveBeenCalledWith(
      expect.stringContaining("Selected output"),
      expect.stringContaining("[[quote]]"),
      "side-1",
    );
    expect(result.current.messages[0].content).toContain("Explain this");
    expect(result.current.busy).toBe(true);
    emit("session://stream", {
      sessionId: "main-1",
      messageId: "foreign",
      text: "wrong chat",
      done: true,
    });
    expect(result.current.messages).toHaveLength(1);
    emit("session://stream", {
      sessionId: "side-1",
      messageId: "reply",
      text: "Explanation",
      done: true,
    });
    expect(result.current.messages.at(-1)?.content).toBe("Explanation");
    // A segment's done marker is not the end of the agent turn.
    expect(result.current.busy).toBe(true);
    await act(async () => {
      await result.current.stop();
    });
    expect(api.sessionStop).toHaveBeenCalledWith("side-1");
    expect(result.current.busy).toBe(false);
  });

  it("settles from authoritative runtime and reuses the side conversation for follow-ups", async () => {
    const { result } = renderHook(() =>
      useTranscriptSideChat(project, "/project"),
    );
    await act(async () => {
      await result.current.send("First", [quote], "Side chat");
    });
    vi.mocked(api.sessionMessages).mockResolvedValue([
      {
        id: "saved",
        role: "assistant",
        content: "Final answer",
        createdAt: "",
      },
    ]);
    emit("session://runtime", ready);
    await waitFor(() =>
      expect(result.current.messages[0]?.content).toBe("Final answer"),
    );
    expect(result.current.busy).toBe(false);
    await act(async () => {
      await result.current.send("Follow up", [], "Side chat");
    });
    expect(api.sessionCreate).toHaveBeenCalledTimes(1);
    expect(api.sessionSend).toHaveBeenLastCalledWith(
      "Follow up",
      "Follow up",
      "side-1",
    );
  });

  it("keeps connection errors recoverable without sending into the main session", async () => {
    vi.mocked(api.sessionConnect).mockRejectedValueOnce(
      new Error("NETWORK_PROVIDER: offline"),
    );
    const { result } = renderHook(() =>
      useTranscriptSideChat(project, "/project"),
    );
    await act(async () => {
      expect(await result.current.send("Retry me", [quote], "Side chat")).toBe(
        false,
      );
    });
    expect(api.sessionSend).not.toHaveBeenCalled();
    expect(result.current.error).toContain("offline");
    expect(result.current.busy).toBe(false);
    await act(async () => {
      expect(await result.current.send("Retry me", [quote], "Side chat")).toBe(
        true,
      );
    });
    expect(api.sessionCreate).toHaveBeenCalledTimes(1);
  });

  it("blocks duplicate sends while connecting and abandons unsent work after navigation", async () => {
    let finish!: (value: SessionSnapshot) => void;
    vi.mocked(api.sessionConnect).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result, unmount } = renderHook(() =>
      useTranscriptSideChat(project, "/project"),
    );
    let first!: Promise<boolean>;
    act(() => {
      first = result.current.send("First", [quote], "Side chat");
    });
    await waitFor(() => expect(api.sessionConnect).toHaveBeenCalled());
    expect(await result.current.send("Duplicate", [], "Side chat")).toBe(false);
    unmount();
    finish(ready);
    expect(await first).toBe(false);
    expect(api.sessionSend).not.toHaveBeenCalled();
    expect(handlers.size).toBe(0);
  });

  it("routes approval and questions only from this side session", async () => {
    const { result } = renderHook(() =>
      useTranscriptSideChat(project, "/project"),
    );
    await act(async () => {
      await result.current.send("Question", [], "Side chat");
    });
    const permission = { sessionId: "main", rpcId: 1, title: "Main approval" };
    emit("session://permission", permission);
    expect(result.current.permission).toBeNull();
    emit("session://permission", { ...permission, sessionId: "side-1" });
    expect(result.current.permission?.rpcId).toBe(1);
    emit("session://ask_user", {
      sessionId: "side-1",
      rpcId: 2,
      questions: [],
    });
    expect(result.current.askUser?.rpcId).toBe(2);
    emit("session://ask_user_cleared", { sessionId: "main" });
    expect(result.current.askUser?.rpcId).toBe(2);
    emit("session://runtime", ready);
    expect(result.current.permission).toBeNull();
    expect(result.current.askUser).toBeNull();
  });
  it("surfaces a turn error and releases the side send button without changing other chats", async () => {
    const { result } = renderHook(() =>
      useTranscriptSideChat(project, "/project"),
    );
    await act(async () => {
      await result.current.send("Question", [], "Side chat");
    });
    emit("session://turn_error", {
      sessionId: "main",
      code: "NETWORK_PROVIDER",
      message: "main failure",
    });
    expect(result.current.error).toBeNull();
    emit("session://turn_error", {
      sessionId: "side-1",
      code: "NETWORK_PROVIDER",
      message: "upstream closed",
    });
    expect(result.current.error).toBe("NETWORK_PROVIDER: upstream closed");
    expect(result.current.busy).toBe(false);
  });

  it("settles a turn that already finished before the send call returned", async () => {
    vi.mocked(api.sessionSend).mockResolvedValue(ready);
    vi.mocked(api.sessionMessages).mockResolvedValue([
      {
        id: "answer",
        role: "assistant",
        content: "Fast answer",
        createdAt: "",
      },
    ]);
    const { result } = renderHook(() =>
      useTranscriptSideChat(project, "/project"),
    );
    await act(async () => {
      await result.current.send("Question", [], "Side chat");
    });
    await waitFor(() =>
      expect(result.current.messages[0]?.content).toBe("Fast answer"),
    );
    expect(result.current.busy).toBe(false);
    await act(async () => {
      expect(await result.current.send("Follow up", [], "Side chat")).toBe(
        true,
      );
    });
  });
});

it("shows only its own tool activity, settles errors and resets on the next turn", async () => {
  const { result } = renderHook(() => useTranscriptSideChat(project, "/project"));
  await act(async () => { await result.current.send("Question", [], "Side chat"); });
  emit("session://tool", {sessionId:"main-1",toolCallId:"foreign",title:"Wrong task",status:"completed"});
  expect(result.current.toolActivity).toBeNull();
  emit("session://tool", {sessionId:"side-1",toolCallId:"browser-1",title:"Inspect page",kind:"browser",status:"in_progress"});
  await waitFor(() => expect(result.current.toolActivity?.streaming).toBe(true));
  expect(result.current.toolActivity?.toolCallId).toBe("browser-1");
  emit("session://tool", {sessionId:"side-1",toolCallId:"browser-1",status:"failed",output:"Page unavailable"});
  expect(result.current.toolActivity).toMatchObject({streaming:false,isError:true,toolOutput:"Page unavailable"});
  emit("session://runtime", ready);
  await act(async () => { await result.current.send("Next", [], "Side chat"); });
  expect(result.current.toolActivity).toBeNull();
  emit("session://tool", {sessionId:"side-1",toolCallId:"pending",title:"Read page",status:"in_progress"});
  await act(async () => { await result.current.stop(); });
  expect(result.current.toolActivity).toMatchObject({streaming:false,toolStatus:"cancelled"});
});
