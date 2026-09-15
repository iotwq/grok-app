/** @vitest-environment jsdom */
import { useState } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposerEditor } from "./ComposerEditor";

let frames: Map<number, FrameRequestCallback>;
let frameId = 0;

beforeEach(() => {
  frames = new Map();
  // jsdom has no range geometry; give the caret a visible line box.
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [new DOMRect(0, 4, 1, 22)],
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (Range.prototype as Partial<Range>).getClientRects;
});

function paintFrame() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  });
}

function setupEditor() {
  const changed = vi.fn();
  function Harness() {
    const [value, setValue] = useState("hello");
    return <ComposerEditor value={value} onChange={(next) => {
      changed(next);
      setValue(next);
    }} />;
  }
  const view = render(<Harness />);
  const editor = view.getByRole("textbox");
  const measure = vi.fn(() => 26);
  Object.defineProperty(editor, "clientHeight", { get: measure });
  Object.defineProperty(editor, "scrollHeight", { get: () => 26 });
  paintFrame();
  measure.mockClear();
  return { ...view, editor, measure, changed };
}

describe("composer layout scheduling", () => {
  it("commits rapid typing immediately but measures at most once per frame", () => {
    const { editor, measure, changed } = setupEditor();
    for (const text of ["hello a", "hello ab", "hello abc"]) {
      editor.textContent = text;
      fireEvent.input(editor);
      expect(changed).toHaveBeenLastCalledWith(text);
    }
    expect(measure).not.toHaveBeenCalled();
    paintFrame();
    expect(measure).toHaveBeenCalledTimes(1);
    expect(editor.textContent).toBe("hello abc");
  });

  it("does not resize or commit IME preedit, then commits the chosen text", () => {
    const { editor, measure, changed } = setupEditor();
    // A pending resize from typing must also yield to a newly opened IME.
    editor.textContent = "hello ";
    fireEvent.input(editor);
    changed.mockClear();
    measure.mockClear();
    fireEvent.compositionStart(editor);
    editor.textContent = "hello ni";
    fireEvent.input(editor);
    paintFrame();
    expect(measure).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    editor.textContent = "hello 你";
    fireEvent.compositionEnd(editor);
    expect(changed).toHaveBeenLastCalledWith("hello 你");
    paintFrame();
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("drops pending editor layout when unmounted", () => {
    const { editor, measure, unmount } = setupEditor();
    editor.textContent = "hello next";
    fireEvent.input(editor);
    measure.mockClear();
    unmount();
    paintFrame();
    expect(measure).not.toHaveBeenCalled();
  });

  it("grows and shrinks external drafts on the next frame", () => {
    const view = render(<ComposerEditor value="hello" onChange={() => {}} />);
    const editor = view.getByRole("textbox");
    let contentHeight = 22;
    Object.defineProperty(editor, "clientHeight", {
      get: () => Number.parseFloat(editor.style.height) || 22,
    });
    Object.defineProperty(editor, "scrollHeight", { get: () => contentHeight });
    paintFrame();
    contentHeight = 88;
    view.rerender(<ComposerEditor value={"one\ntwo\nthree\nfour"} onChange={() => {}} />);
    paintFrame();
    expect(editor.style.height).toBe("88px");
    contentHeight = 22;
    view.rerender(<ComposerEditor value="" onChange={() => {}} />);
    paintFrame();
    expect(editor.textContent).toBe("");
    expect(editor.style.height).toBe("22px");
  });

  it("keeps Shift+Enter text and grows before painting the next frame", () => {
    const { editor, changed } = setupEditor();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });
    expect(changed).toHaveBeenLastCalledWith("hello\n");
    paintFrame();
    expect(editor.textContent).toContain("hello");
    expect(window.getSelection()?.anchorNode).not.toBeNull();
  });
});
