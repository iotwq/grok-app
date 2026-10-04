import { describe, expect, it } from "vitest";
import { applyAgentBrowserTab } from "./useAgentBrowser";
import { emptySideWorkbenchState, openSideTab } from "@/lib/sideWorkbench";

const tabId = "agent-00000000-0000-4000-8000-000000000001";
describe("agent browser tab lifecycle", () => {
  it("opens its own tab even when a user tab already displays the same URL", () => {
    const original = openSideTab(emptySideWorkbenchState(), "browser", {url:"https://example.com",id:"user-tab"});
    const opened = applyAgentBrowserTab(original, {tabId,action:"open",url:"https://example.com"});
    expect(opened.tabs).toHaveLength(2);
    expect(opened.activeId).toBe(tabId);
    const navigated = applyAgentBrowserTab(opened, {tabId,action:"open",url:"https://example.org"});
    expect(navigated.tabs).toHaveLength(2);
    expect(navigated.tabs[0]).toMatchObject({id:tabId,url:"https://example.org"});
    const closed = applyAgentBrowserTab(navigated, {tabId,action:"close"});
    expect(closed.tabs).toHaveLength(1);
    expect(closed.tabs[0].id).toBe("user-tab");
  });
  it("ignores invalid targets and navigation schemes", () => {
    const original = emptySideWorkbenchState();
    expect(applyAgentBrowserTab(original, {tabId:"main",action:"close"})).toBe(original);
    expect(applyAgentBrowserTab(original, {tabId,action:"open",url:"file:///etc/passwd"})).toBe(original);
  });
});

it("only accepts browser events for the visible workspace", async () => {
  const { isAgentBrowserProjectActive } = await import("./useAgentBrowser");
  expect(isAgentBrowserProjectActive("/project/A", "/project/B")).toBe(false);
  expect(isAgentBrowserProjectActive("/project/A/", "/project/A")).toBe(true);
  expect(isAgentBrowserProjectActive("C:\\work\\A", "C:/work/A")).toBe(true);
  expect(isAgentBrowserProjectActive("/project/A", null)).toBe(false);
  expect(isAgentBrowserProjectActive("", null)).toBe(true);
});
