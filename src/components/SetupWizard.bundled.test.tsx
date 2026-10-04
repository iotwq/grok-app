// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createT } from "@/i18n";
import * as api from "@/lib/api";
import { SetupWizard, type SetupCliInfo } from "./SetupWizard";

vi.mock("@/lib/api", () => ({
  probeCli: vi.fn(),
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/components/WindowControls", () => ({
  tauriDragRegion: () => ({}), titlebarMaximizeHandlers: () => ({}),
}));
const tr = createT("en");
const missing = { found: false, path: null, version: null, source: "not_found", cliAuthPresent: false };
const ready = { found: true, path: "/App/grok-build", version: "grok 1.0.34", source: "bundled", cliAuthPresent: false };
function open(initialCli: SetupCliInfo = missing) {
  render(<SetupWizard tr={tr} platform="mac" useCustomWindowChrome={false}
    initialCli={initialCli} onComplete={() => {}} onAccountLoginOauth={async () => false} />);
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.probeCli).mockResolvedValue(missing);
});

describe("bundled runtime first run", () => {
  it("starts at the optional account step when the bundled runtime is ready", () => {
    open(ready);
    expect(screen.getByText(tr("setup.account.title"))).toBeTruthy();
    expect(screen.queryByText(tr("setup.install"))).toBeNull();
    expect(screen.queryByText(tr("setup.pickBinary"))).toBeNull();
    expect(api.probeCli).not.toHaveBeenCalled();
  });

  it("offers App recovery for a missing runtime, never an external CLI installer", async () => {
    open();
    await waitFor(() => expect(api.probeCli).toHaveBeenCalledWith());
    expect(screen.getByText(tr("runtime.bundled.missing"))).toBeTruthy();
    expect(screen.queryByText(tr("setup.install"))).toBeNull();
    expect(screen.queryByText(tr("setup.pickBinary"))).toBeNull();
    expect(screen.queryByText(tr("setup.copyCmd"))).toBeNull();
    fireEvent.click(screen.getByText(tr("runtime.bundled.download")));
    expect(api.openExternalUrl).toHaveBeenCalledWith(expect.stringContaining("/releases/latest"));
    vi.mocked(api.probeCli).mockResolvedValue(ready);
    fireEvent.click(screen.getByText(tr("setup.recheck")));
    fireEvent.click(await screen.findByText(tr("setup.continue")));
    expect(screen.getByText(tr("setup.account.title"))).toBeTruthy();
  });
});
