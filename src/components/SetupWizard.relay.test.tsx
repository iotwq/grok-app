// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createT } from "@/i18n";
import * as api from "@/lib/api";
import { SetupWizard } from "./SetupWizard";

vi.mock("@/lib/api", () => ({
  isTauri: () => false,
  cliInstallCommands: vi.fn().mockResolvedValue(null),
  providersUpsert: vi.fn().mockResolvedValue({}),
  providersPing: vi.fn().mockResolvedValue({ ok: true }),
  secretsSet: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/components/WindowControls", () => ({
  tauriDragRegion: () => ({}),
  titlebarMaximizeHandlers: () => ({}),
}));

const tr = createT("en");
function openRelay() {
  render(<SetupWizard tr={tr} platform="mac" useCustomWindowChrome={false}
    initialCli={{ found: true, path: "/test/grok", version: "1.0.25", source: "manual", cliAuthPresent: false }}
    onComplete={() => {}} onAccountLoginOauth={async () => false} />);
  fireEvent.click(screen.getByText(tr("setup.account.relay")));
  fireEvent.change(screen.getByPlaceholderText(tr("setup.account.basePh")), { target: { value: "https://relay.example/v1" } });
  fireEvent.change(screen.getByPlaceholderText(tr("setup.account.relayKeyPh")), { target: { value: "test-key" } });
}
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("first-run relay configuration", () => {
  it("requires an explicit model instead of guessing default", () => {
    openRelay();
    expect((screen.getByText(tr("setup.account.saveRelay")) as HTMLButtonElement).disabled).toBe(true);
    expect(api.providersUpsert).not.toHaveBeenCalled();
  });

  it("persists the selected model and replaces the legacy default catalog", async () => {
    openRelay();
    fireEvent.change(screen.getByLabelText(tr("prov.modelId")), { target: { value: "  real-model  " } });
    fireEvent.click(screen.getByText(tr("setup.account.saveRelay")));
    await screen.findByText(tr("setup.ready.title"));
    expect(api.providersUpsert).toHaveBeenCalledWith(expect.objectContaining({
      id: "relay", model: "real-model", models: [{ id: "real-model", name: "real-model" }], setAsDefault: true,
    }));
  });
});
