// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserTab } from "./BrowserTab";
import * as api from "@/lib/api";
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (payload: unknown) => void>() }));
vi.mock("@/lib/api", () => ({
  isDesktopHost: () => true, isTauri: vi.fn(() => false),
  listen: vi.fn(async (name: string, fn: (payload: unknown) => void) => { handlers.set(name, fn); return () => handlers.delete(name); }),
  sideBrowserEval: vi.fn(async () => "true"), sshBrowserPrepare: vi.fn(),
}));
vi.mock("@/components/EmbeddedBrowser", () => ({
  sideBrowserWebviewLabel: (id: string) => `resource-browser-${id}`,
  EmbeddedBrowser: ({url,onLoadingChange}: {url:string;onLoadingChange:(value:boolean)=>void}) => {
    useEffect(() => onLoadingChange(false), [url,onLoadingChange]);
    return <div data-testid="native-url">{url}</div>;
  },
}));
vi.mock("@/hooks/useBrowserDesignMode", () => ({useBrowserDesignMode: () => ({status:"idle",selection:null,shot:{dataUrl:null,status:"idle"},clearSelection:vi.fn()})}));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); handlers.clear(); vi.mocked(api.isTauri).mockReturnValue(false); vi.mocked(api.sideBrowserEval).mockResolvedValue("true"); });
it("updates saved location after native navigation and restores that URL on remount", async () => {
 const onUrlChange=vi.fn();
 const {unmount}=render(<BrowserTab locale="en" tabId="test" url="https://example.com/a" onUrlChange={onUrlChange}/>);
 await waitFor(() => expect(handlers.has("side-browser://page-load")).toBe(true));
 act(() => handlers.get("side-browser://page-load")!({label:"resource-browser-test",phase:"finished",url:"https://example.com/b"}));
 expect(onUrlChange).toHaveBeenLastCalledWith("https://example.com/b");
 expect((screen.getByTestId("side-browser-url") as HTMLInputElement).value).toBe("https://example.com/b");
 unmount();
 render(<BrowserTab locale="en" tabId="test" url={onUrlChange.mock.lastCall![0]}/>);
 expect(screen.getByTestId("native-url").textContent).toBe("https://example.com/b");
});
it("back/forward use the tab history and report navigation errors", async () => {
 render(<BrowserTab locale="en" tabId="test" url="https://example.com/a"/>);
 fireEvent.click(screen.getByRole("button",{name:"Back"}));
 await waitFor(() => expect(api.sideBrowserEval).toHaveBeenCalledWith("resource-browser-test","history.back(); true"));
 await waitFor(() => expect((screen.getByRole("button",{name:"Forward"}) as HTMLButtonElement).disabled).toBe(false));
 vi.mocked(api.sideBrowserEval).mockRejectedValueOnce(new Error("WebView unavailable"));
 fireEvent.click(screen.getByRole("button",{name:"Forward"}));
 await screen.findByRole("alert");
 expect(api.sideBrowserEval).toHaveBeenLastCalledWith("resource-browser-test","history.forward(); true");
 expect(screen.getByRole("alert").textContent).toContain("WebView unavailable");
});
it("saves the remote URL rather than a temporary SSH forwarding port", async () => {
 vi.mocked(api.isTauri).mockReturnValue(true);
 vi.mocked(api.sshBrowserPrepare).mockResolvedValue({ok:true,tunneled:true,alias:"remote",displayUrl:"http://localhost:3000/a",url:"http://127.0.0.1:49123/a"});
 const onUrlChange=vi.fn();
 render(<BrowserTab locale="en" tabId="test" url="http://localhost:3000/a" sshAlias="remote" onUrlChange={onUrlChange}/>);
 await waitFor(() => expect(screen.getByTestId("native-url").textContent).toBe("http://127.0.0.1:49123/a"));
 act(() => handlers.get("side-browser://page-load")!({label:"resource-browser-test",phase:"finished",url:"http://127.0.0.1:49123/b?q=1"}));
 expect(onUrlChange).toHaveBeenLastCalledWith("http://localhost:3000/b?q=1");
});
