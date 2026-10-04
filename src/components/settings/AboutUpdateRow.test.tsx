// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createT } from "@/i18n";
import { AboutUpdateRow } from "./AboutUpdateRow";
const { source } = vi.hoisted(() => ({source:{value:{} as Record<string, unknown>}}));
vi.mock("@/hooks/UpdaterProvider", () => ({useUpdaterContext: () => source.value}));
vi.mock("@/lib/api", () => ({isDesktopHost:()=>true}));
afterEach(cleanup);
it("explains an unconfigured build and offers no update actions", () => {
 source.value={status:{state:"idle"},channelInfo:{channel:"github_manual",pluginEnabled:false,platformSupported:true,manualConfigured:false},githubReleasesUrl:""};
 render(<AboutUpdateRow t={createT("en")}/>);
 expect(screen.getByRole("status").textContent).toContain("no update source configured");
 expect(screen.queryByRole("button")).toBeNull();
});
it("explains a missing compatible installer while retaining its own release page", () => {
 source.value={status:{state:"manual-required",version:"1.0.0",releaseUrl:"https://example.com/releases",downloadUrl:null,assetNames:["Grok_linux_aarch64.AppImage"]},channelInfo:{channel:"github_manual",pluginEnabled:false,platformSupported:true,manualConfigured:true},githubReleasesUrl:"https://example.com/releases"};
 render(<AboutUpdateRow t={createT("en")}/>);
 expect(screen.getByText("No installer matching this system and processor was found in this release.")).toBeTruthy();
 expect(screen.queryByRole("button",{name:"Download installer"})).toBeNull();
 expect(screen.getByRole("button",{name:"Open release page"})).toBeTruthy();
});
