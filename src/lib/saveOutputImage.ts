import { exportBytesSave, isTauri } from "./api";
import { resolveImageSrc } from "./imageSrc";

/** Save original bytes, never a transcript thumbnail or a canvas re-encoding. */
export async function saveOutputImage(source: string, dialogTitle: string): Promise<boolean> {
  const url = await resolveImageSrc(source);
  if (!url) throw new Error("image_unavailable");
  const response = await fetch(url);
  if (!response.ok) throw new Error("image_fetch_failed");
  const blob = await response.blob();
  if (!blob.size || blob.size > 40 * 1024 * 1024) throw new Error("image_size");
  const extensions: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
    "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif",
    "image/bmp": "bmp", "image/tiff": "tiff", "image/x-icon": "ico",
  };
  const mime = blob.type.split(";", 1)[0].toLowerCase();
  const name = source.startsWith("data:") || source.startsWith("blob:")
    ? "image"
    : (source.split(/[?#]/, 1)[0].split(/[/\\]/).pop() || "image");
  const extension = extensions[mime] || (/\.(png|jpe?g|webp|gif|svg|avif|bmp|tiff?|ico)$/i.exec(name)?.[1]);
  if (!extension || (mime && !mime.startsWith("image/") && mime !== "application/octet-stream")) {
    throw new Error("not_an_image");
  }
  const defaultName = /\.[a-z0-9]+$/i.test(name) ? name : `${name}.${extension}`;
  if (isTauri()) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const result = await exportBytesSave({ bytesBase64: btoa(binary), defaultName, dialogTitle, filterName: extension.toUpperCase(), extensions: [extension] });
    if (result.cancelled) return false;
    if (!result.ok) throw new Error("image_save_failed");
    return true;
  }
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = defaultName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  return true;
}
