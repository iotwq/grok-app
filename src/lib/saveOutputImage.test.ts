import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveOutputImage } from "./saveOutputImage";
import { exportBytesSave } from "./api";
import { resolveImageSrc } from "./imageSrc";

vi.mock("./api", () => ({ isTauri: () => true, exportBytesSave: vi.fn(async () => ({ ok: true })) }));
vi.mock("./imageSrc", () => ({ resolveImageSrc: vi.fn(async () => "http://127.0.0.1:9000/v1/media?t=private&p=original") }));
const fetchImage = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchImage);
  fetchImage.mockResolvedValue({ ok: true, blob: async () => new Blob(["original GIF bytes"], { type: "image/gif" }) });
});
afterEach(() => vi.unstubAllGlobals());

describe("save original output image", () => {
  it("resolves the original local file and saves its bytes and extension", async () => {
    expect(await saveOutputImage("/Users/test/animated.gif", "Save image as…")).toBe(true);
    expect(resolveImageSrc).toHaveBeenCalledWith("/Users/test/animated.gif");
    expect(exportBytesSave).toHaveBeenCalledWith({
      bytesBase64: btoa("original GIF bytes"), defaultName: "animated.gif",
      extensions: ["gif"], filterName: "GIF", dialogTitle: "Save image as…",
    });
  });
  it("treats a cancelled save dialog as a cancellation", async () => {
    vi.mocked(exportBytesSave).mockResolvedValueOnce({ ok: false, cancelled: true });
    expect(await saveOutputImage("https://example.com/image.gif", "Save")).toBe(false);
  });
  it("rejects download failures without opening a save dialog", async () => {
    fetchImage.mockResolvedValueOnce({ ok: false });
    await expect(saveOutputImage("https://example.com/image.gif", "Save")).rejects.toThrow();
    expect(exportBytesSave).not.toHaveBeenCalled();
  });
  it("rejects HTML responses instead of saving an error page as an image", async () => {
    fetchImage.mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["error"], { type: "text/html" }) });
    await expect(saveOutputImage("https://example.com/image.gif", "Save")).rejects.toThrow("not_an_image");
    expect(exportBytesSave).not.toHaveBeenCalled();
  });
  it("reports a failed save result", async () => {
    vi.mocked(exportBytesSave).mockResolvedValueOnce({ ok: false });
    await expect(saveOutputImage("/Users/test/image.gif", "Save")).rejects.toThrow("image_save_failed");
  });
});
