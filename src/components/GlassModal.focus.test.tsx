// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GlassModal } from "./GlassModal";
import { installDialogFocus } from "@/lib/a11yFocus";
afterEach(cleanup);
it("Escape dismisses only the child and restores focus to the parent's opener", async () => {
  const parentClose = vi.fn();
  function Harness() {
    const [child, setChild] = useState(false);
    return <GlassModal open onClose={parentClose} title="Parent">
      <button onClick={() => setChild(true)}>Open child</button>
      <GlassModal open={child} onClose={() => setChild(false)} title="Child"><button>Child action</button></GlassModal>
    </GlassModal>;
  }
  render(<Harness />);
  await waitFor(() => expect(document.activeElement).toBe(within(screen.getByRole("dialog", { name: "Parent" })).getByLabelText("Close")));
  const opener = screen.getByText("Open child");
  opener.focus();
  fireEvent.click(opener);
  await waitFor(() => expect(document.activeElement).toBe(within(screen.getByRole("dialog", { name: "Child" })).getByLabelText("Close")));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Child" })).toBeNull();
  expect(parentClose).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(opener);
  fireEvent.keyDown(opener, { key: "Escape" });
  expect(parentClose).toHaveBeenCalledTimes(1);
});
it("uses rendered order even when focus handlers register in reverse order", () => {
  const a = document.createElement("div"), b = document.createElement("div");
  document.body.append(a, b);
  const parent = vi.fn(), child = vi.fn();
  const offB = installDialogFocus(() => b, { initialFocus: "none", onEscape: child });
  const offA = installDialogFocus(() => a, { initialFocus: "none", onEscape: parent });
  fireEvent.keyDown(b, { key: "Escape" });
  expect(child).toHaveBeenCalledTimes(1);
  expect(parent).not.toHaveBeenCalled();
  offA(); offB(); a.remove(); b.remove();
});
