// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AskUserBar } from "./AskUserBar";
afterEach(cleanup);

it("does not submit the main agent question when Enter is pressed in the side chat", async () => {
  const onSubmit = vi.fn();
  render(
    <>
      <AskUserBar
        payload={{
          sessionId: "main",
          rpcId: 1,
          questions: [
            {
              id: "q",
              question: "Main question",
              options: [],
              multiSelect: false,
            },
          ],
        }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        labels={{
          title: "Question",
          submit: "Submit",
          cancel: "Cancel",
          otherPlaceholder: "Answer",
          freeTextHint: "Answer",
          multiHint: "Choose",
          minimize: "Minimize",
          restore: "Restore",
          pendingChip: "Pending",
        }}
      />
      <aside className="side-chat">
        <textarea aria-label="Side question" />
      </aside>
    </>,
  );
  const mainAnswer = screen.getByPlaceholderText("Answer");
  fireEvent.change(mainAnswer, { target: { value: "Main answer" } });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Side question" }), {
    key: "Enter",
  });
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.keyDown(mainAnswer, { key: "Enter" });
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith({ "Main question": "Main answer" }),
  );
});
