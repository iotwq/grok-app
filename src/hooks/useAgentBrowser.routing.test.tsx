// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAgentBrowser } from "./useAgentBrowser";
const { handlers, emit } = vi.hoisted(() => ({ handlers: new Map<string, (event: {payload: unknown}) => void>(), emit: vi.fn(async () => {}) }));
vi.mock("@/lib/api", () => ({ isDesktopHost: () => true }));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ label: "main", listen: async (name: string, fn: (event: {payload: unknown}) => void) => { handlers.set(name, fn); return () => handlers.delete(name); } }) }));
vi.mock("@tauri-apps/api/event", () => ({ emit }));
afterEach(() => { cleanup(); handlers.clear(); vi.clearAllMocks(); });
it("does not open or expand a background project's browser and reports its ownership", async () => {
 const setState = vi.fn(), openPane = vi.fn();
 const { rerender } = renderHook(({path}) => useAgentBrowser({projectPath:path,setState,openPane,collapsed:true}), {initialProps:{path:"/B"}});
 await waitFor(() => expect(handlers.has("browser-agent://check-project")).toBe(true));
 const payload = {tabId:"agent-00000000-0000-4000-8000-000000000001",action:"open",url:"https://example.com",projectPath:"/A"};
 act(() => {
  handlers.get("browser-agent://check-project")!({payload:{requestId:"r",projectPath:"/A"}});
  handlers.get("browser-agent://tab")!({payload});
 });
 expect(emit).toHaveBeenCalledWith("browser-agent://project-result", {requestId:"r",active:false});
 expect(setState).not.toHaveBeenCalled(); expect(openPane).not.toHaveBeenCalled();
 rerender({path:"/A"});
 act(() => handlers.get("browser-agent://tab")!({payload}));
 expect(setState).toHaveBeenCalledTimes(1); expect(openPane).toHaveBeenCalledTimes(1);
});
