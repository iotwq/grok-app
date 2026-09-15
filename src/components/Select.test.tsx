// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GlassModal } from "./GlassModal";
import { installDialogFocus } from "@/lib/a11yFocus";
import { Select } from "./Select";
afterEach(cleanup);
const options = [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }];
it.each(["deleted-relay", ""])("shows the actual unmatched value %s without changing it", (value) => {
  const change = vi.fn();
  render(<Select value={value} options={options} onChange={change} />);
  expect(screen.getByRole("button").textContent).toBe(value);
  expect(change).not.toHaveBeenCalled();
});
it("shows matching labels and updates only when the user selects an option", async () => {
  const change = vi.fn();
  render(<Select value="a" options={options} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
  fireEvent.click(await screen.findByRole("option", { name: "Beta" }));
  expect(change).toHaveBeenCalledExactlyOnceWith("b");
});

it.each([false, true])("supports arrows, skipped disabled options and Escape in a modal (capture=%s)", async (capture) => {
  const close = vi.fn(), change = vi.fn();
  render(<GlassModal open onClose={close} title="Choose"><Select value="a" options={[...options, { value: "x", label: "Disabled", disabled: true }, { value: "c", label: "Gamma" }]} onChange={change} /></GlassModal>);
  const dialog = screen.getByRole("dialog");
  const trigger = screen.getByRole("button", { name: "Alpha" });
  await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText("Close")));
  const off = capture ? installDialogFocus(() => dialog, { onEscape: close, initialFocus: "none" }) : () => {};
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const alpha = await screen.findByRole("option", { name: "Alpha" });
  await waitFor(() => expect(document.activeElement).toBe(alpha));
  fireEvent.keyDown(alpha, { key: "End" });
  expect(document.activeElement).toBe(screen.getByRole("option", { name: "Gamma" }));
  fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
  expect(document.activeElement).toBe(screen.getByRole("option", { name: "Beta" }));
  fireEvent.keyDown(document.activeElement!, { key: "Home" });
  expect(document.activeElement).toBe(alpha);
  fireEvent.keyDown(alpha, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(close).not.toHaveBeenCalled();
  expect(change).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
  off();
});
it("selects with Space and returns focus, then Tab wraps inside the modal", async () => {
  const change = vi.fn();
  render(<GlassModal open onClose={() => {}} title="Choose"><Select value="a" options={options} onChange={change} /></GlassModal>);
  const trigger = screen.getByRole("button", { name: "Alpha" });
  fireEvent.click(trigger);
  const alpha = await screen.findByRole("option", { name: "Alpha" });
  await waitFor(() => expect(document.activeElement).toBe(alpha));
  fireEvent.keyDown(alpha, { key: "ArrowDown" });
  fireEvent.keyDown(document.activeElement!, { key: " " });
  expect(change).toHaveBeenCalledExactlyOnceWith("b");
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  await screen.findByRole("option", { name: "Alpha" });
  fireEvent.keyDown(document.activeElement!, { key: "Tab" });
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(document.activeElement).toBe(screen.getByLabelText("Close"));
});

it("opens an unknown value upward at the last enabled option and selects with Enter", async () => {
  const change = vi.fn();
  render(<Select value="unknown" options={options} onChange={change} />);
  const trigger = screen.getByRole("button");
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowUp" });
  const beta = await screen.findByRole("option", { name: "Beta" });
  await waitFor(() => expect(document.activeElement).toBe(beta));
  expect(beta.tabIndex).toBe(0);
  expect(screen.getByRole("option", { name: "Alpha" }).tabIndex).toBe(-1);
  fireEvent.keyDown(beta, { key: "Enter" });
  expect(change).toHaveBeenCalledExactlyOnceWith("b");
  expect(document.activeElement).toBe(trigger);
});
