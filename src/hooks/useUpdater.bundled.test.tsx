// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { detectAppPlatform } from "@/lib/appPlatform";
import { useUpdater } from "./useUpdater";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/api", () => ({ isDesktopHost: () => true }));
vi.mock("@/lib/appPlatform", () => ({ detectAppPlatform: vi.fn() }));
vi.mock("@/lib/updateSim", () => ({
  UPDATE_SIM_CHANGE_EVENT: "sim-change", UPDATE_SIM_VERSION: "0.0.0",
  clearUpdateSimIfDeveloperModeOff: vi.fn(), installUpdateSimConsoleApi: vi.fn(),
  installDeveloperModeSimCleanup: vi.fn(), readUpdateSimMode: () => "off", sleepMs: vi.fn(),
}));
const events: string[] = [];
const install = vi.fn();
const download = vi.fn();
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks(); events.length = 0;
  vi.mocked(detectAppPlatform).mockReturnValue("win");
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "prepare_for_app_update") { events.push("stop"); return undefined; }
    if (command === "updater_status") return { platformSupported: true, pluginEnabled: true, channel: "silent", endpoint: "test" };
    return true;
  });
  download.mockImplementation(async () => { events.push("download"); });
  install.mockImplementation(async () => { events.push("install"); });
  vi.mocked(relaunch).mockImplementation(async () => { events.push("restart"); });
  vi.mocked(check).mockResolvedValue({ version: "0.3.0", download, install, close: vi.fn() } as unknown as NonNullable<Awaited<ReturnType<typeof check>>>);
});
async function ready() {
  const hook = renderHook(() => useUpdater());
  await waitFor(() => expect(hook.result.current.status.state).toBe("ready"));
  expect(events).toEqual(["download"]); // Background discovery never stops a session.
  return hook;
}
describe("bundled runtime update lifecycle", () => {
  it("Windows releases the runtime before launching the exiting installer", async () => {
    const { result } = await ready();
    await act(async () => { await result.current.installAndRelaunch(); });
    expect(events).toEqual(["download", "stop", "install", "restart"]);
  });
  it("Windows failed installation requires restart and cannot skip cleanup on retry", async () => {
    const { result } = await ready();
    install.mockRejectedValueOnce(new Error("installer failed"));
    await act(async () => { await result.current.installAndRelaunch(); });
    expect(result.current.status).toMatchObject({ state: "error", restartRequired: true });
    await act(async () => { await result.current.checkForUpdate(); await result.current.applyAvailableUpdate(); });
    expect(check).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.restartAfterFailedUpdate(); });
    expect(relaunch).toHaveBeenCalledTimes(1);
  });
  it("Windows refuses installation if it cannot release the bundled runtime", async () => {
    const { result } = await ready();
    vi.mocked(invoke).mockRejectedValueOnce(new Error("runtime still running"));
    await act(async () => { await result.current.installAndRelaunch(); });
    expect(install).not.toHaveBeenCalled();
    expect(result.current.status).toMatchObject({ state: "error", restartRequired: true });
  });
  it("macOS installation failure leaves sessions running", async () => {
    vi.mocked(detectAppPlatform).mockReturnValue("mac");
    const { result } = await ready();
    install.mockRejectedValueOnce(new Error("installer failed"));
    await act(async () => { await result.current.installAndRelaunch(); });
    expect(events).toEqual(["download"]);
    expect(result.current.status).toMatchObject({ state: "error", restartRequired: false });
  });
  it("macOS installs before stopping sessions and restarting", async () => {
    vi.mocked(detectAppPlatform).mockReturnValue("mac");
    const { result } = await ready();
    await act(async () => { await result.current.installAndRelaunch(); });
    expect(events).toEqual(["download", "install", "stop", "restart"]);
  });
});

it("unconfigured local builds never query upstream or offer an installer", async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "updater_status") return {
      platformSupported: true, pluginEnabled: false, channel: "github_manual",
      endpoint: "", manualConfigured: false, releaseUrl: "",
    };
    if (command === "is_updater_plugin_enabled") return false;
    throw new Error(`Unexpected command: ${command}`);
  });
  const { result } = renderHook(() => useUpdater());
  await waitFor(() => expect(result.current.channelInfo.manualConfigured).toBe(false));
  await act(async () => { await result.current.checkForUpdate(); });
  expect(invoke).not.toHaveBeenCalledWith("app_check_update");
  expect(check).not.toHaveBeenCalled();
  expect(result.current.status.state).toBe("idle");
  expect(result.current.githubReleasesUrl).toBe("");
});

it("preserves a signed-channel check error when no manual fallback is configured", async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "updater_status") return {platformSupported:true,pluginEnabled:true,channel:"silent",endpoint:"https://updates.example.com/latest.json",manualConfigured:false,releaseUrl:""};
    return true;
  });
  vi.mocked(check).mockRejectedValue(new Error("update server unavailable"));
  const {result}=renderHook(() => useUpdater());
  await waitFor(() => expect(result.current.channelInfo.pluginEnabled).toBe(true));
  await act(async () => { await result.current.checkForUpdate(); });
  await waitFor(() => expect(result.current.status).toMatchObject({state:"error",message:"update server unavailable"}));
  expect(invoke).not.toHaveBeenCalledWith("app_check_update");
});
