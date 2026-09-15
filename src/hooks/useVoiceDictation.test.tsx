/** @vitest-environment jsdom */
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createT } from "@/i18n";
import type { ViewFocus } from "@/lib/viewFocus";
import { useVoiceDictation } from "./useVoiceDictation";
import * as api from "@/lib/api";
import * as capture from "@/lib/voiceCapture";

vi.mock("@/lib/api", () => ({ isTauri: () => true,
  providersList: async () => ({ activeSource: "official" }),
  voiceStatus: async () => ({ available: true }), voiceTranscribe: vi.fn() }));
vi.mock("@/lib/mirrorTransport", () => ({ isMirrorClient: () => false }));
vi.mock("@/components/ComposerEditor", () => ({ getComposerCaretOffset: () => null }));
vi.mock("@/lib/voiceCapture", () => ({ startVoiceCapture: vi.fn(),
  blobToBase64: async () => "synthetic-audio", extensionForMime: () => "webm" }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });
const tr = createT("en");
async function setup(autoSend = true, initialId: string | null = "A") {
  const cancelCapture = vi.fn();
  vi.mocked(capture.startVoiceCapture).mockResolvedValue({
    stop: async () => new Blob(["x".repeat(300)], { type: "audio/webm" }), cancel: cancelCapture,
  });
  let finish!: (r: Awaited<ReturnType<typeof api.voiceTranscribe>>) => void;
  vi.mocked(api.voiceTranscribe).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  let focus: ViewFocus = { sessionId: initialId, epoch: 0 };
  const sendA = vi.fn(async () => {}), sendB = vi.fn(async () => {});
  const opts: Omit<Parameters<typeof useVoiceDictation>[0], "setDraft"> = {
    tr, localeRef: { current: "en" }, composerInputRef: { current: null },
    sendRef: { current: sendA }, voiceDictationAutoSendRef: { current: autoSend },
    currentViewFocus: () => focus, sessionState: "ready", refreshSessions: vi.fn(),
    sttEngine: "xai", sttCustomBaseUrl: "", signedInRef: { current: true }, notifyRef: { current: vi.fn() },
  };
  const hook = renderHook(() => {
    const [draft, setDraft] = useState("A draft");
    return { voice: useVoiceDictation({ ...opts, setDraft }), draft, setDraft };
  });
  await waitFor(() => expect(hook.result.current.voice.voiceGate.available).toBe(true));
  await act(async () => { await hook.result.current.voice.startVoice(); });
  let stopped!: Promise<void>;
  await act(async () => { stopped = hook.result.current.voice.stopVoice(); await Promise.resolve(); });
  expect(api.voiceTranscribe).toHaveBeenCalledOnce();
  const navigate = (id: string | null, render = true) => {
    focus = { sessionId: id, epoch: focus.epoch + 1 };
    opts.sendRef.current = sendB;
    if (render) act(() => { hook.result.current.setDraft("B draft"); });
  };
  const resolve = async (response = { ok: true, text: "A transcript" }) => {
    await act(async () => { finish(response); await stopped; });
  };
  return { ...hook, opts, resolve, navigate, sendA, sendB, cancelCapture };
}

for (const initialId of ["A", null]) {
  it(`drops old transcription after navigating from ${initialId ?? "a draft"}`, async () => {
    const h = await setup(true, initialId);
    h.navigate(initialId === null ? null : "B");
    await h.resolve();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(h.result.current.draft).toBe("B draft");
    expect(h.sendA).not.toHaveBeenCalled();
    expect(h.sendB).not.toHaveBeenCalled();
    expect(h.result.current.voice.voice.phase).toBe("idle");
  });
}

it("rechecks the view before a scheduled automatic send, even before React rerenders", async () => {
  const h = await setup();
  vi.useFakeTimers();
  await h.resolve();
  h.navigate("B", false);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(h.sendA).not.toHaveBeenCalled();
  expect(h.sendB).not.toHaveBeenCalled();
});

for (const autoSend of [true, false]) {
  it(`keeps dictation in the same view working with auto-send ${autoSend}`, async () => {
    const h = await setup(autoSend);
    await h.resolve();
    await waitFor(() => expect(h.result.current.draft).toContain("A transcript"));
    if (autoSend) await waitFor(() => expect(h.sendA).toHaveBeenCalledOnce());
    else expect(h.sendA).not.toHaveBeenCalled();
    expect(h.sendB).not.toHaveBeenCalled();
  });
}

it("ignores a transcription completed after cancel", async () => {
  const h = await setup();
  act(() => h.result.current.voice.cancelVoice());
  await h.resolve();
  expect(h.result.current.draft).toBe("A draft");
  expect(h.sendA).not.toHaveBeenCalled();
});

it("does not change the draft or send when transcription fails", async () => {
  const h = await setup();
  await h.resolve({ ok: false, text: "" });
  expect(h.result.current.draft).toBe("A draft");
  expect(h.sendA).not.toHaveBeenCalled();
  expect(h.opts.notifyRef.current).toHaveBeenCalled();
});

it("invalidates pending transcription and cancels capture on unmount", async () => {
  const h = await setup();
  h.unmount();
  await h.resolve();
  expect(h.cancelCapture).toHaveBeenCalled();
  expect(h.sendA).not.toHaveBeenCalled();
});
