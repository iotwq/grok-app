/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createT } from "@/i18n";
import type { SessionSnapshot, SessionState } from "@/lib/session";
import { useSendQueue, type UseSendQueueOptions } from "./useSendQueue";
import { useQueueEditDialog } from "./useQueueEditDialog";

vi.mock("@/lib/api", () => ({ isTauri: () => false, hasHost: () => false }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
const tr = createT("en");
function setup(state: SessionState = "streaming") {
  vi.useFakeTimers();
  const execute = vi.fn<UseSendQueueOptions["executeSendRef"]["current"]>(async () => true);
  const liveHostRef = { current: { sessionId: "s1", state, lastError: null, streamingMessageId: null, backend: "test" } as SessionSnapshot };
  const opts: UseSendQueueOptions = { sessionId: "s1", sessionState: state, connecting: false,
    liveHostRef, viewingSessionIdRef: { current: "s1" }, sendInFlightRef: { current: false },
    executeSendRef: { current: execute }, showToast: vi.fn(),
    labels: { sendFailed: "failed", droppedOldest: () => "dropped" } };
  const hook = renderHook(({ state, sessionId }: { state: SessionState; sessionId: string }) => {
    const queue = useSendQueue({ ...opts, sessionState: state, sessionId });
    const edit = useQueueEditDialog({ tr, showToast: opts.showToast, ...queue });
    return { queue, edit };
  }, { initialProps: { state, sessionId: "s1" } });
  function transition(nextState: SessionState, sessionId = "s1") {
    opts.viewingSessionIdRef.current = sessionId;
    liveHostRef.current = { ...liveHostRef.current, state: nextState, sessionId };
    hook.rerender({ state: nextState, sessionId });
  }
  act(() => { hook.result.current.queue.enqueue({ storedDisplay: "old prompt", attachments: [], goalMode: false }); });
  return { ...hook, execute, transition, opts };
}
async function advance() {
  await act(async () => { await vi.advanceTimersByTimeAsync(80); });
}

for (const close of ["save", "cancel"] as const) {
  it(`keeps the queued message paused across turn completion until edit ${close}`, async () => {
    const { result, transition, execute } = setup();
    act(() => { result.current.edit.openEdit(result.current.queue.activeQueue[0]!); });
    act(() => { result.current.edit.setEditText("corrected prompt"); });
    for (const state of ["awaiting_permission", "streaming", "ready"] as const) {
      transition(state);
      await advance();
      expect(execute).not.toHaveBeenCalled();
      expect(result.current.queue.flushHold).toBe(true);
    }
    act(() => { if (close === "save") result.current.edit.saveEdit(); else result.current.edit.closeEdit(); });
    await advance();
    expect(execute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ storedDisplay: close === "save" ? "corrected prompt" : "old prompt" }));
    expect(result.current.queue.activeQueue).toHaveLength(0);
  });
}

it("releases the edited session's hold when the user closes after navigating away", async () => {
  const { result, transition, execute } = setup();
  act(() => result.current.edit.openEdit(result.current.queue.activeQueue[0]!));
  transition("ready", "s2");
  act(() => result.current.edit.closeEdit());
  transition("ready", "s1");
  await advance();
  expect(execute).toHaveBeenCalledOnce();
});
