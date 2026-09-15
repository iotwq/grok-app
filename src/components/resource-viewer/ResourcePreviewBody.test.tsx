/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ResourcePreviewBody, type ResourcePreviewBodyProps } from "./ResourcePreviewBody";
import type { FileTab } from "./types";

vi.mock("@/lib/api", () => ({ isTauri: () => false }));
vi.mock("@/components/MarkdownPreview", () => ({
  MarkdownPreview: ({ children }: { children: string }) => <div data-testid="body">{children}</div>,
}));
vi.mock("@/components/CodePreview", () => ({
  CodePreview: ({ code }: { code: string }) => <div data-testid="body">{code}</div>,
}));
vi.mock("@/components/OverlayScroll", () => ({
  OverlayScroll: ({ children }: { children: React.ReactNode }) => children,
}));
afterEach(cleanup);

for (const kind of ["markdown", "html", "json"]) {
  for (const draftText of ["", "NEW CONTENT"]) {
    it(`previews the exact ${kind} draft (${draftText ? "nonempty" : "empty"}) instead of saved content`, async () => {
      const activeTab = {
        id: "A", tabKind: "file", relativePath: "A", absolutePath: "/project/A",
        draftText, baselineText: "OLD CONTENT", editMode: false,
        preview: { kind, text: "OLD CONTENT", name: "A", absolutePath: "/project/A", truncated: false, error: null },
      } as FileTab;
      const props = { tr: (key: string) => key, locale: "en", sideMode: "files", diffView: null, activeTab, hideToolbar: true } as ResourcePreviewBodyProps;
      const view = render(<ResourcePreviewBody {...props} />);
      if (kind === "html") {
        const frame = await waitFor(() => view.getByTitle("A"));
        expect(frame.getAttribute("srcdoc")).toBe(draftText);
      } else {
        const body = await view.findByTestId("body");
        expect(body.textContent).toBe(draftText);
      }
    });
  }
}
