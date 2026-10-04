import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { isDesktopHost } from "@/lib/api";
import { closeSideTab, openSideTab, type SideWorkbenchState } from "@/lib/sideWorkbench";

export type AgentBrowserTabEvent = {
  tabId: string;
  action: "open" | "close";
  url?: string;
  projectPath?: string;
};

export function applyAgentBrowserTab(state: SideWorkbenchState, event: AgentBrowserTabEvent): SideWorkbenchState {
  if (!/^agent-[0-9a-f-]{36}$/.test(event.tabId)) return state;
  if (event.action === "close") return closeSideTab(state, event.tabId);
  if (event.action !== "open" || !event.url || !/^https?:\/\//.test(event.url)) return state;
  // Open by ID without URL dedup: each agent connection owns its own tab.
  const next = openSideTab(state, "browser", { id: event.tabId });
  return { ...next, tabs: next.tabs.map(tab => tab.id === event.tabId && tab.kind === "browser"
    ? { ...tab, url: event.url } : tab) };
}

export function isAgentBrowserProjectActive(owner: string | undefined, current: string | null): boolean {
  const normalize = (path: string | null | undefined) => (path ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  return normalize(owner) === normalize(current);
}

export function useAgentBrowser(options: {
  setState: Dispatch<SetStateAction<SideWorkbenchState>>;
  collapsed: boolean;
  projectPath: string | null;
  openPane: () => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    if (!isDesktopHost()) return;
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    void import("@tauri-apps/api/webview").then(async ({ getCurrentWebview }) => {
      const view = getCurrentWebview();
      if (view.label !== "main" || disposed) return;
      const stop = await view.listen<AgentBrowserTabEvent>("browser-agent://tab", ({ payload }) => {
        if (disposed || !isAgentBrowserProjectActive(payload.projectPath, latest.current.projectPath)) return;
        latest.current.setState(state => applyAgentBrowserTab(state, payload));
        if (payload.action === "open" && latest.current.collapsed) latest.current.openPane();
      });
      if (disposed) { stop(); return; }
      unlisteners.push(stop);
      const { emit } = await import("@tauri-apps/api/event");
      if (disposed) return;
      const stopCheck = await view.listen<{ requestId: string; projectPath: string }>("browser-agent://check-project", ({ payload }) => {
        if (disposed) return;
        void emit("browser-agent://project-result", {
          requestId: payload.requestId,
          active: isAgentBrowserProjectActive(payload.projectPath, latest.current.projectPath),
        }).catch(error => console.error("[agent-browser] project reply failed", error));
      });
      if (disposed) stopCheck(); else unlisteners.push(stopCheck);
    }).catch(error => console.error("[agent-browser] listener failed", error));
    return () => { disposed = true; unlisteners.forEach(stop => stop()); };
  }, []);
}
