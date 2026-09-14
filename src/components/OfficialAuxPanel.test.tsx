// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createT } from "@/i18n";
import * as api from "@/lib/api";
import { OfficialAuxPanel } from "./OfficialAuxPanel";

vi.mock("@/lib/api", () => ({
  isTauri: () => true,
  providersList: vi.fn().mockResolvedValue({ activeSource: "custom" }),
  secretsGetMasked: vi.fn().mockResolvedValue({ hasOfficialKey: true }),
  settingsGet: vi.fn().mockResolvedValue({ officialAuxInject: true }),
  officialAuxStatus: vi.fn().mockResolvedValue({ reason: "node_missing", available: false }),
  settingsSet: vi.fn().mockResolvedValue({}),
}));
afterEach(cleanup);
const tr = createT("en");

describe("official auxiliary runtime readiness", () => {
  it("disables unavailable injection and rechecks after installing Node", async () => {
    render(<OfficialAuxPanel locale="en" />);
    await screen.findByText(tr("prov.officialAuxNodeMissing"));
    const toggle = screen.getByLabelText(tr("prov.officialAuxInject")) as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(toggle.checked).toBe(false);
    expect(api.settingsSet).not.toHaveBeenCalled();
    vi.mocked(api.officialAuxStatus).mockResolvedValueOnce({
      available: true, reason: "api_key", hasApiKey: true, hasCliAuth: false, home: "/test", model: "grok-4.6",
    });
    fireEvent.click(screen.getByText(tr("setup.recheck")));
    await waitFor(() => expect((screen.getByLabelText(tr("prov.officialAuxInject")) as HTMLInputElement).disabled).toBe(false));
    expect((screen.getByLabelText(tr("prov.officialAuxInject")) as HTMLInputElement).checked).toBe(true);
  });
});
