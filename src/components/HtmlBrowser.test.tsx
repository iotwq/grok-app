/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HtmlBrowser } from "./HtmlBrowser";
vi.mock("@/lib/api", () => ({ isTauri: () => false }));
afterEach(cleanup);

for (const content of ["", "  \n  "]) {
  it(`renders an explicitly supplied blank document without reading disk: ${JSON.stringify(content)}`, () => {
    const view = render(<HtmlBrowser title="preview" absolutePath="/project/A.html" html="OLD" />);
    view.rerender(<HtmlBrowser title="preview" absolutePath="/project/A.html" html={content} />);
    expect(view.getByTitle("preview").getAttribute("srcdoc")).toBe(content);
    expect(view.queryByRole("alert")).toBeNull();
  });
}
