/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MarkdownTiptapEditor, type MarkdownTiptapLabels } from "./MarkdownTiptapEditor";

vi.mock("@/components/ui/tooltip", () => ({
  Tip: ({ children }: { children: React.ReactNode }) => children,
}));
afterEach(cleanup);
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
