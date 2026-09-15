// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAppDialogs } from "./useAppDialogs";

afterEach(cleanup);
function mount(confirm = vi.fn()) {
  function Harness() {
    const d = useAppDialogs();
    return <>
      <button onClick={() => d.setAppDialog({ kind: "confirm", title: "Delete", message: "Delete?", onConfirm: confirm })}>Open</button>
      {d.appDialog && <div ref={d.appDialogPanelRef}>
        <button ref={d.confirmBtnRef} onClick={confirm}>Confirm</button>
        <button onClick={d.closeDialog}>Cancel</button>
        <button onClick={d.closeDialog}>Close</button>
      </div>}
    </>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByText("Open"));
  return confirm;
}

describe("confirmation keyboard actions", () => {
  it.each(["Cancel", "Close"])("preserves the %s button's native Enter action", (label) => {
    const confirm = mount();
    const button = screen.getByText(label);
    button.focus();
    expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(screen.queryByText("Confirm")).toBeNull();
  });
  it("confirms exactly once from the focused primary button", () => {
    const confirm = mount();
    const button = screen.getByText("Confirm");
    button.focus();
    expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  it("blocks held Enter from accepting another confirmation", () => {
    const confirm = mount();
    const button = screen.getByText("Confirm");
    button.focus();
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm")).toBeTruthy();
  });
  it("does not confirm from outside the dialog or during IME composition", () => {
    const confirm = mount();
    fireEvent.keyDown(document.body, { key: "Enter" });
    fireEvent.keyDown(screen.getByText("Confirm"), { key: "Enter", isComposing: true });
    expect(confirm).not.toHaveBeenCalled();
  });
});
