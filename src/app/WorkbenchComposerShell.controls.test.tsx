// @vitest-environment jsdom
import "@/test/jsdomStubs";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createT } from "@/i18n";
import { IDLE_SNAPSHOT } from "@/lib/session";
import { initialVoiceState } from "@/lib/voiceDictation";
import { WorkbenchComposerShell, type WorkbenchComposerShellProps } from "./WorkbenchComposerShell";

afterEach(cleanup);

const menuPos = {
  left: 0, top: 0, width: 400, placeAbove: true, maxHeight: 300,
  maxWidth: 400, fitContent: false, align: "start" as const,
};

function props(overrides: Partial<WorkbenchComposerShellProps> = {}) {
  return {
    tr: createT("en"), locale: "en", phoneLayout: false,
    session: { ...IDLE_SNAPSHOT, state: "ready" },
    voice: initialVoiceState(), voiceGate: { available: true, reason: null },
    toggleVoice: vi.fn(), closeComposerMenu: vi.fn(), openSideSkillsPanel: vi.fn(),
    sendQueueStrip: { visible: false }, sendQueue: { canShowQueueButton: () => false },
    attachments: [], chatAttachments: [], quotes: [],
    sideWorkbench: { tabs: [] }, layout: { asideCollapsed: true },
    mode: "agent", policy: "ask",
    composerInputRef: createRef<HTMLDivElement>(), composerShellRef: createRef<HTMLDivElement>(),
    composerPlusPanelRef: createRef<HTMLDivElement>(), composerPlusTriggerRef: createRef<HTMLButtonElement>(),
    composerMenuOpen: false, composerMenuEntries: [],
    liveSlash: { present: false, query: "", start: 0, end: 0 },
    slashCatalog: { skills: [] }, slashActiveIndex: 0,
    contextUsageDisplay: {
      source: "unknown", tokens: null, label: "—", lastCompact: null,
      breakdown: null, knownUsage: null, windowSize: null, percent: null,
      cacheHitRate: null, cachedReadTokens: null,
    },
    ...overrides,
  } as WorkbenchComposerShellProps;
}

describe("composer secondary controls", () => {
  it("keeps idle tools out of the row and puts the model immediately before Send", () => {
    const { container } = render(<WorkbenchComposerShell {...props({
      modelControl: <button>Model control</button>,
    })} />);
    const row = container.querySelector(".composer__row")!;
    expect(within(row as HTMLElement).queryByRole("button", { name: /Voice|Find skills/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Model control" }).nextElementSibling)
      .toBe(screen.getByRole("button", { name: "Send" }));
  });

  it("opens skills and dictation from the Add menu, closing the menu first", async () => {
    const user = userEvent.setup();
    const p = props({ composerMenuOpen: true, composerPlusPos: menuPos });
    render(<WorkbenchComposerShell {...p} />);
    await user.click(screen.getByRole("button", { name: "Find skills" }));
    expect(p.openSideSkillsPanel).toHaveBeenCalledOnce();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Voice dictation" }));
    await user.keyboard(" ");
    expect(p.toggleVoice).toHaveBeenCalledOnce();
    expect(p.closeComposerMenu).toHaveBeenCalledTimes(2);
    expect(vi.mocked(p.closeComposerMenu).mock.invocationCallOrder[1])
      .toBeLessThan(vi.mocked(p.toggleVoice).mock.invocationCallOrder[0]!);
  });

  it.each(["requesting_mic", "recording", "transcribing"] as const)(
    "keeps the stop/cancel control reachable during %s even if voice availability changes",
    async (phase) => {
      const user = userEvent.setup();
      const p = props({ voice: { ...initialVoiceState(), phase }, voiceGate: { available: false, reason: "not_available" } });
      const { container } = render(<WorkbenchComposerShell {...p} />);
      const mic = container.querySelector<HTMLButtonElement>(".composer__voice")!;
      expect(mic).not.toBeNull();
      expect(mic.disabled).toBe(false);
      await user.click(mic);
      expect(p.toggleVoice).toHaveBeenCalledOnce();
    },
  );

  it("disables starting dictation while Live Voice is open", () => {
    render(<WorkbenchComposerShell {...props({
      composerMenuOpen: true, composerPlusPos: menuPos, liveVoiceOpen: true,
    })} />);
    expect(screen.getByRole("button", { name: "Voice dictation" }).hasAttribute("disabled")).toBe(true);
  });
});
