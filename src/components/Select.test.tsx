// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  fireEvent.click(await screen.findByRole("button", { name: "Beta" }));
  expect(change).toHaveBeenCalledExactlyOnceWith("b");
});
