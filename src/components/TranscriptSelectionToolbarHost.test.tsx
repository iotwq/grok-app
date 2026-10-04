// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { TranscriptSelectionToolbarHost } from "./TranscriptSelectionToolbarHost";
import { ChatWithSideChat } from "./TranscriptSideChat";
import * as api from "@/lib/api";
import { IDLE_SNAPSHOT } from "@/lib/session";

vi.mock("@/lib/api", () => ({
  listen: vi.fn(async () => () => {}),
  sessionCreate: vi.fn(),
  sessionConnect: vi.fn(),
  sessionSend: vi.fn(),
  sessionStop: vi.fn(),
  sessionMessages: vi.fn(),
}));
vi.mock("@/components/MarkdownBody", () => ({
  MarkdownBody: ({ children }: { children: string }) => <div>{children}</div>,
}));
const onAddQuote = vi.fn();
const resourceMenu = vi.fn();
const labels = {
  addQuote: "添加到对话",
  askSideChat: "在侧边聊天中提问",
  selection: "选中文字",
};
function Fixture({
  enabled = true,
  sourceKey = "main-session",
}: {
  enabled?: boolean;
  sourceKey?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <ChatWithSideChat
      sourceKey={sourceKey}
      locale="zh"
      project={null}
      projectPath={null}
      onOpenSession={vi.fn()}
    >
      <div className="main__stage">
        <div ref={scrollRef}>
          <p data-message-id="answer-1">选中的回答内容</p>
          <a href="https://example.com" onContextMenu={resourceMenu}>输出链接</a>
          <span data-output-resource="image" onContextMenu={resourceMenu}>输出图片</span>
        </div>
        <textarea
          aria-label="main draft"
          className="composer__input"
          defaultValue="主对话草稿"
        />
        <TranscriptSelectionToolbarHost
          scrollRef={scrollRef}
          sessionId={sourceKey}
          onAddQuote={onAddQuote}
          labels={labels}
          enabled={enabled}
        />
      </div>
    </ChatWithSideChat>
  );
}
async function selectExcerpt(rightClick = false) {
  const node = screen.getByText("选中的回答内容", { selector: "p[data-message-id]" });
  const range = document.createRange();
  range.selectNodeContents(node);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  if (rightClick) fireEvent.contextMenu(node, { clientX: 100, clientY: 100 });
  else fireEvent(document, new Event("selectionchange"));
  await screen.findByRole("toolbar");
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Range.prototype.getBoundingClientRect = () => ({
    left: 100,
    width: 140,
    top: 70,
    bottom: 90,
    height: 20,
    right: 240,
    x: 100,
    y: 70,
    toJSON: () => ({}),
  });
  vi.mocked(api.sessionCreate).mockResolvedValue({
    id: "side-1",
    title: "Side",
    projectId: null,
    updatedAt: "",
  });
  vi.mocked(api.sessionConnect).mockResolvedValue({
    ...IDLE_SNAPSHOT,
    sessionId: "side-1",
    state: "ready",
  });
  vi.mocked(api.sessionSend).mockResolvedValue({
    ...IDLE_SNAPSHOT,
    sessionId: "side-1",
    state: "streaming",
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.getSelection()?.removeAllRanges();
});

describe("selection actions", () => {
  it("shows only two actions and attaches the selected message without changing the draft", async () => {
    render(<Fixture />);
    await selectExcerpt();
    expect(screen.getByRole("toolbar").querySelectorAll("button")).toHaveLength(
      2,
    );
    expect(screen.getByRole("toolbar").querySelector("textarea")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: labels.addQuote }));
    expect(onAddQuote).toHaveBeenCalledWith({
      text: "选中的回答内容",
      comment: "",
      sourceMessageId: "answer-1",
    });
    expect(
      (
        screen.getByRole("textbox", {
          name: "main draft",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("主对话草稿");
    expect(api.sessionSend).not.toHaveBeenCalled();
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("opens a focused side composer without making a model request, then sends the quote independently", async () => {
    render(<Fixture />);
    await selectExcerpt();
    fireEvent.click(screen.getByRole("button", { name: labels.askSideChat }));
    const input = screen.getByRole("textbox", { name: "针对这段内容提问…" });
    expect(document.activeElement).toBe(input);
    expect(api.sessionCreate).not.toHaveBeenCalled();
    expect(api.sessionSend).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "这是什么意思？" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() =>
      expect(api.sessionSend).toHaveBeenCalledWith(
        expect.stringContaining("选中的回答内容"),
        expect.stringContaining("这是什么意思？"),
        "side-1",
      ),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "main draft",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("主对话草稿");
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(""));
  });

  it("preserves a failed side draft and quote for retry, and keeps them on close/reopen", async () => {
    vi.mocked(api.sessionConnect).mockRejectedValueOnce(
      new Error("NETWORK_PROVIDER: offline"),
    );
    render(<Fixture />);
    await selectExcerpt();
    fireEvent.click(screen.getByRole("button", { name: labels.askSideChat }));
    const input = screen.getByRole("textbox", { name: "针对这段内容提问…" });
    fireEvent.change(input, { target: { value: "保留问题" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByRole("alert");
    expect((input as HTMLTextAreaElement).value).toBe("保留问题");
    expect(screen.getByRole("button", { name: "移除引用" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "侧边聊天" }));
    expect((input as HTMLTextAreaElement).value).toBe("保留问题");
  });

  it("right-click uses the same actions with the floating preference off; Escape and scrolling dismiss", async () => {
    render(<Fixture enabled={false} />);
    await selectExcerpt(true);
    expect(
      screen.getByRole("button", { name: labels.askSideChat }),
    ).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("toolbar")).toBeNull();
    await selectExcerpt(true);
    fireEvent.scroll(document);
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("closes side context on navigation without remounting the main composer", async () => {
    const { rerender } = render(<Fixture />);
    const main = screen.getByRole("textbox", { name: "main draft" });
    await selectExcerpt();
    fireEvent.click(screen.getByRole("button", { name: labels.askSideChat }));
    await act(async () => {
      rerender(<Fixture sourceKey="another-session" />);
    });
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByRole("textbox", { name: "main draft" })).toBe(main);
  });
});


it.each(["输出链接", "输出图片"])("lets %s open its own menu when text remains selected", async (name) => {
  render(<Fixture />);
  await selectExcerpt();
  fireEvent.contextMenu(screen.getByText(name), { clientX: 220, clientY: 140 });
  expect(resourceMenu).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("toolbar")).toBeNull();
  expect(onAddQuote).not.toHaveBeenCalled();
});

it("restores side draft and quotes after visiting another main conversation", async () => {
  const { rerender } = render(<Fixture sourceKey="A" />);
  await selectExcerpt();
  fireEvent.click(screen.getByRole("button", { name: labels.askSideChat }));
  fireEvent.change(screen.getByRole("textbox", { name: "针对这段内容提问…" }), { target: { value: "保留 A 的问题" } });
  rerender(<Fixture sourceKey="B" />);
  await selectExcerpt();
  fireEvent.click(screen.getByRole("button", { name: labels.askSideChat }));
  fireEvent.change(screen.getByRole("textbox", { name: "针对这段内容提问…" }), { target: { value: "保留 B 的问题" } });
  rerender(<Fixture sourceKey="A" />);
  expect((screen.getByRole("textbox", { name: "针对这段内容提问…" }) as HTMLTextAreaElement).value).toBe("保留 A 的问题");
  expect(screen.getAllByRole("button", { name: "移除引用" })).toHaveLength(1);
  rerender(<Fixture sourceKey="B" />);
  expect((screen.getByRole("textbox", { name: "针对这段内容提问…" }) as HTMLTextAreaElement).value).toBe("保留 B 的问题");
  expect(api.sessionCreate).not.toHaveBeenCalled();
});

it("shows tool progress and failure details instead of only thinking", async () => {
  const listeners = new Map<string, (payload: unknown) => void>();
  vi.mocked(api.listen).mockImplementation(async (name, fn) => {
    listeners.set(name, fn as (payload: unknown) => void);
    return () => { listeners.delete(name); };
  });
  render(<Fixture />);
  await selectExcerpt();
  fireEvent.click(screen.getByRole("button", { name: labels.askSideChat }));
  const input = screen.getByRole("textbox", { name: "针对这段内容提问…" });
  fireEvent.change(input, {target:{value:"Read this page"}});
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(api.sessionSend).toHaveBeenCalled());
  act(() => listeners.get("session://tool")!({sessionId:"side-1",toolCallId:"t",title:"Inspect page",kind:"browser",status:"in_progress"}));
  const row = await screen.findByTestId("timeline-tool");
  expect(row.classList.contains("is-running")).toBe(true);
  expect(screen.queryByText("思考中…")).toBeNull();
  act(() => listeners.get("session://tool")!({sessionId:"side-1",toolCallId:"t",title:"Inspect page",status:"failed",output:"Page unavailable"}));
  expect(row.classList.contains("is-error")).toBe(true);
  expect(row.classList.contains("is-running")).toBe(false);
});
