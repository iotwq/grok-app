/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MarkdownTiptapEditor, type MarkdownTiptapLabels } from "./MarkdownTiptapEditor";
import { localPathToMediaHttpUrl } from "@/lib/imageSrc";

// TipTap's deferred focus scroll reads Range geometry, which jsdom omits.
Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });

vi.mock("@/lib/imageSrc", () => ({
  ensureMediaEndpoint: async () => null,
  localPathToMediaHttpUrl: vi.fn((path: string) => `http://127.0.0.1:54321/v1/media?p=${encodeURIComponent(path)}`),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tip: ({ children }: { children: React.ReactNode }) => children,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const labels = Object.fromEntries(
  "bold italic strike code h1 h2 h3 bulletList orderedList blockquote link hr linkPlaceholder linkApply placeholder editorAria"
    .split(" ").map((key) => [key, key]),
) as MarkdownTiptapLabels;

it("preserves images and table cells when editing an unrelated paragraph", async () => {
  const onChange = vi.fn();
  const value = 'Intro\n\n![diagram](./diagram.png "Diagram")\n\n| Item | Value |\n| --- | --- |\n| A | 42 |\n\nEnd';
  const view = render(<MarkdownTiptapEditor value={value} onChange={onChange} labels={labels} />);
  const button = await waitFor(() => view.getByRole("button", { name: "hr" }));
  fireEvent.click(button);
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  const saved = onChange.mock.lastCall![0] as string;
  expect(saved).toContain('![diagram](./diagram.png "Diagram")');
  expect(saved).toMatch(/\|\s*Item\s*\|\s*Value\s*\|/);
  expect(saved).toMatch(/\|\s*A\s*\|\s*42\s*\|/);
  expect(saved).toContain("Intro");
  expect(saved).toContain("End");
  expect(saved).toContain("---");
});

it("does not emit a document edit when reloading or reverting content", async () => {
  const onChange = vi.fn();
  const view = render(<MarkdownTiptapEditor value="old" onChange={onChange} labels={labels} />);
  await waitFor(() => view.getByRole("button", { name: "hr" }));
  view.rerender(<MarkdownTiptapEditor value="new\n\n![keep](./keep.png)" onChange={onChange} labels={labels} />);
  expect(onChange).not.toHaveBeenCalled();
});

it("displays a relative image through media HTTP while saving the original reference", async () => {
  const onChange = vi.fn();
  const view = render(<MarkdownTiptapEditor documentPath="/Users/test/docs/report.md" value={'Intro\n\n![plot](../images/plot%20one.png "Plot")'} onChange={onChange} labels={labels} />);
  const image = await view.findByRole("img", { name: "plot" });
  expect(image.getAttribute("src")).toBe("http://127.0.0.1:54321/v1/media?p=%2FUsers%2Ftest%2Fimages%2Fplot%20one.png");
  expect(localPathToMediaHttpUrl).toHaveBeenCalledWith("/Users/test/images/plot one.png");
  fireEvent.click(view.getByRole("button", { name: "hr" }));
  expect(onChange.mock.lastCall![0]).toContain("../images/plot%20one.png");
  expect(onChange.mock.lastCall![0]).not.toContain("127.0.0.1");
});
