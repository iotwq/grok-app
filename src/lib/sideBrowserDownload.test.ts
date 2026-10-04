// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
// jsdom ships no declarations in this workspace; describe the two APIs used here.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: { url: string; runScripts: "outside-only" }) => {
    window: Window & typeof globalThis;
  };
};
import { afterEach, describe, expect, it, vi } from "vitest";

// Execute the exact Rust-injected script, expanding only format!'s braces/label.
const rust = readFileSync("src-tauri/src/side_browser_blob.rs", "utf8");
const raw = rust.slice(rust.indexOf('r##"(function ()'), rust.indexOf('"##,', rust.indexOf('r##"(function ()')));
const script = raw.slice(4).replaceAll("{label_js}", JSON.stringify("resource-browser-test"))
  .replaceAll("{{", "{").replaceAll("}}", "}");
const pages: InstanceType<typeof JSDOM>[] = [];
function page(url = "https://www.reuters.com/") {
  const dom = new JSDOM("<!doctype html><title>News</title><body></body>", { url, runScripts: "outside-only" });
  pages.push(dom);
  const w = dom.window;
  const fetch = vi.fn((_url: string, _options?: RequestInit) => new Promise<Response>(() => {}));
  Object.assign(w, { fetch });
  w.eval(script);
  return { w, fetch };
}
afterEach(() => { pages.splice(0).forEach(dom => dom.window.close()); });

describe("side browser download intent", () => {
  it("leaves advertising and content iframe navigation intact without fetching downloads", () => {
    const { w, fetch } = page();
    for (const url of ["https://ads.example/sync-container", "https://ads.example/container.html", "https://ads.example/pixel.png", "https://docs.example/report.pdf"]) {
      const frame = w.document.createElement("iframe");
      frame.src = url;
      w.document.body.appendChild(frame);
      expect(frame.src).toBe(url);
      const inserted = w.document.createElement("iframe");
      inserted.setAttribute("src", url);
      w.document.body.insertBefore(inserted, frame);
      expect(inserted.src).toBe(url);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(w.document.title).toBe("News");
  });
  it("does not download links just because the page renders them", () => {
    const { w, fetch } = page();
    const link = w.document.createElement("a");
    link.href = "https://files.example/report.pdf";
    link.download = "report.pdf";
    w.document.body.appendChild(link);
    expect(fetch).not.toHaveBeenCalled();
    link.click();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(link.href);
  });
  it("retains explicit data download clicks without downloading on insertion", async () => {
    const { w } = page();
    const link = w.document.createElement("a");
    link.href = "data:text/plain,hello";
    link.download = "hello.txt";
    w.document.body.appendChild(link);
    expect(w.document.title).toBe("News");
    link.click();
    await vi.waitFor(() => expect(w.document.title).toMatch(/^__GROK_SBDL__/));
  });
  it("limits ChatCut iframe compatibility to file or export URLs, excluding ad frames and query hints", () => {
    const { w, fetch } = page("https://app.chatcut.io/editor");
    for (const url of ["https://ads.example/container.html", "https://ads.example/sync?next=/download/a.mp4"]) {
      const frame = w.document.createElement("iframe");
      frame.src = url;
      w.document.body.appendChild(frame);
      expect(frame.src).toBe(url);
    }
    expect(fetch).not.toHaveBeenCalled();
    const frame = w.document.createElement("iframe");
    frame.src = "https://files.example/export/video.mp4?signature=example";
    expect(frame.src).toBe("about:blank");
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("does not enable ChatCut compatibility on lookalike domains", () => {
    const { w, fetch } = page("https://chatcut.io.example.com/");
    const frame = w.document.createElement("iframe");
    frame.src = "https://files.example/export/video.mp4";
    expect(fetch).not.toHaveBeenCalled();
    expect(frame.src).toContain("files.example");
  });
});
