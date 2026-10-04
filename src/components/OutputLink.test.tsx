// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutputLink } from "./OutputLink";
import { MarkdownBody } from "./MarkdownBody";
import { MarkdownChat } from "./lobe-chat/MarkdownChat";
import { isTauri } from "@/lib/api/host";
import { openExternalUrl } from "@/lib/api/system";
import { saveConfirmExternalLinksPref } from "@/lib/externalLinkPref";

vi.mock("@/lib/api/host", () => ({ isTauri: vi.fn(() => true) }));
vi.mock("@/lib/api/system", () => ({ openExternalUrl: vi.fn(async () => {}) }));
vi.mock("@/lib/nativeWebviewCover", () => ({ acquireNativeWebviewCover: () => () => {} }));
const copy = vi.fn(async (_text: string) => {});
const url = "https://example.com/docs?q=hi#start";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isTauri).mockReturnValue(true);
  localStorage.clear();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
});
afterEach(cleanup);

describe("output link actions", () => {
  it.each([
    ["markdown prose", `[Docs](${url})`],
    ["autolink", url],
    ["inline URL code", `\`${url}\``],
  ])("uses the same opening callback for %s", async (_kind, source) => {
    const open = vi.fn();
    render(<MarkdownChat onOpenExternalLink={open}>{source}</MarkdownChat>);
    fireEvent.click(screen.getByRole("link"));
    await waitFor(() => expect(open).toHaveBeenCalledWith(url));
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it.each([`[Docs](${url})`, `\`${url}\``])("offers the same link menu in side chat markdown: %s", async (source) => {
    render(<MarkdownBody locale="zh">{source}</MarkdownBody>);
    fireEvent.contextMenu(screen.getByRole("link"));
    expect(openExternalUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "打开链接" }));
    await waitFor(() => expect(openExternalUrl).toHaveBeenCalledWith(url));
  });

  it("copies the full address and opens the requested side resource", async () => {
    const side = vi.fn();
    render(<OutputLink href={url} locale="zh" onOpenInPanel={side}>Docs</OutputLink>);
    fireEvent.contextMenu(screen.getByRole("link"), { clientX: 300, clientY: 200 });
    expect(openExternalUrl).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: "复制链接" }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(url));
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.contextMenu(screen.getByRole("link"));
    fireEvent.click(screen.getByRole("menuitem", { name: "在侧边浏览器打开" }));
    expect(side).toHaveBeenCalledWith(url);
  });

  it("shows copy and native open failures instead of silent WebView fallback", async () => {
    copy.mockRejectedValueOnce(new Error("clipboard blocked"));
    vi.mocked(openExternalUrl).mockRejectedValueOnce(new Error("shell failed"));
    render(<OutputLink href={url} locale="zh">Docs</OutputLink>);
    fireEvent.contextMenu(screen.getByRole("link"));
    fireEvent.click(screen.getByRole("menuitem", { name: "复制链接" }));
    expect((await screen.findByRole("status")).textContent).toContain("复制失败");
    fireEvent.click(screen.getByRole("link"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("无法打开此资源"));
  });

  it("honors external-link confirmation and cancellation without opening", async () => {
    saveConfirmExternalLinksPref(true);
    render(<OutputLink href={url} locale="en">Docs</OutputLink>);
    fireEvent.click(screen.getByRole("link"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(openExternalUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" }).at(-1)!);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("link"));
    fireEvent.click(screen.getByRole("button", { name: "Open link" }));
    await waitFor(() => expect(openExternalUrl).toHaveBeenCalledWith(url));
  });

  it("only shows the most recently opened resource menu", () => {
    render(<><OutputLink href={url}>First</OutputLink><OutputLink href="https://example.org">Second</OutputLink></>);
    fireEvent.contextMenu(screen.getByText("First"));
    fireEvent.contextMenu(screen.getByText("Second"));
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
