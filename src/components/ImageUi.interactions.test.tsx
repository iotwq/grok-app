// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageUi, imageUiLabels } from "./ImageUi";
import { ImageViewerContext } from "./ImageViewerContext";
import { copyImageFromPath } from "@/lib/copyImage";
import { saveOutputImage } from "@/lib/saveOutputImage";
import { pathReveal } from "@/lib/api";

const thumb = "http://127.0.0.1:9000/v1/media?t=private&p=%2Fcache%2Fthumb.jpg";
vi.mock("@/lib/api", () => ({ isTauri: () => true, pathReveal: vi.fn(async () => {}) }));
vi.mock("@/lib/imageThumbClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/imageThumbClient")>(),
  chatCardFirstPaintSrc: () => "http://127.0.0.1:9000/v1/media?t=private&p=%2Fcache%2Fthumb.jpg",
  canUseImageThumb: () => true,
  resolveChatImageThumb: async () => ({ displaySrc: thumb, width: 200, height: 150 }),
}));
vi.mock("@/lib/copyImage", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/copyImage")>(),
  copyImageFromPath: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/saveOutputImage", () => ({ saveOutputImage: vi.fn(async () => true) }));
const copy = vi.fn(async (_text: string) => {});
const open = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
});
afterEach(cleanup);

function setup(source = "/Users/test/original.gif") {
  render(<ImageViewerContext.Provider value={{ open, close: vi.fn(), isOpen: () => false, copyImage: vi.fn() }}>
    <ImageUi src={source} alt="Result" labels={imageUiLabels("en")} />
  </ImageViewerContext.Provider>);
}

describe("output image actions", () => {
  it("previews the original on click and Enter, without opening on right click", async () => {
    setup();
    const image = await screen.findByRole("button", { name: "View image: Result" });
    expect(image.getAttribute("src")).toBe(thumb);
    fireEvent.contextMenu(image);
    expect(open).not.toHaveBeenCalled();
    expect(copyImageFromPath).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(image);
    expect(open.mock.calls[0][0][0].src).toBe("/Users/test/original.gif");
    fireEvent.keyDown(image, { key: "Enter" });
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("copies and saves the original, never the thumbnail", async () => {
    setup();
    fireEvent.contextMenu(await screen.findByRole("button"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy image" }));
    await waitFor(() => expect(copyImageFromPath).toHaveBeenCalledWith("/Users/test/original.gif"));
    fireEvent.contextMenu(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Save image as…" }));
    await waitFor(() => expect(saveOutputImage).toHaveBeenCalledWith("/Users/test/original.gif", "Save image as…"));
  });

  it("copies the original remote URL without leaking the local thumbnail token", async () => {
    setup("https://example.com/image.webp?q=original");
    fireEvent.contextMenu(await screen.findByRole("button"));
    expect(screen.queryByRole("menuitem", { name: "Copy path" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy image address" }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith("https://example.com/image.webp?q=original"));
  });

  it("disables repeat actions while saving and quietly accepts cancellation", async () => {
    let finish!: (saved: boolean) => void;
    vi.mocked(saveOutputImage).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    setup();
    fireEvent.contextMenu(await screen.findByRole("button"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Save image as…" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    fireEvent.contextMenu(screen.getByRole("button"));
    const save = screen.getByRole("menuitem", { name: "Save image as…" });
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(save);
    expect(saveOutputImage).toHaveBeenCalledTimes(1);
    finish(false);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(save.hasAttribute("disabled")).toBe(false);
  });

  it("shows copy and reveal failures", async () => {
    vi.mocked(copyImageFromPath).mockResolvedValueOnce({ ok: false, reason: "write" });
    vi.mocked(pathReveal).mockRejectedValueOnce(new Error("missing"));
    setup();
    fireEvent.contextMenu(await screen.findByRole("button"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy image" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Could not copy"));
    fireEvent.contextMenu(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Show in|Reveal in/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Could not open"));
  });
});
