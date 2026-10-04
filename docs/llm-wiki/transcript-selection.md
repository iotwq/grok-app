# Transcript selection and side chat

Updated: 2026-09-19.

## Selection actions

Selecting transcript text opens one compact, opaque toolbar with two actions:

- **Add to chat / 添加到对话** adds a quote card to the main composer, retains the typed draft, and focuses the composer. It does not send a message.
- **Ask in side chat / 在侧边聊天中提问** opens a right-side composer with the selected quote and focuses its question field. Opening it does not create a session or call a model.

The old comment textarea, copy button, and separate selection context menu are removed. Keyboard copying still uses the native text selection. Right-clicking selected text opens the same actions, including when Settings → Appearance → Selection toolbar is off. The existing setting and search entry are retained; its description reflects the new behavior.

Both selection endpoints must be inside the transcript. Dragging defers toolbar updates until release. Escape, clicking outside, scrolling, resizing, and switching sessions dismiss the toolbar. It is rendered in a portal, measured at its natural width, and clamped inside the viewport, including the bottom/right edges. Clicking an action preserves the captured excerpt and its source message ID.

## Side-chat behavior

The first explicit send creates an independent saved session in the current project and connects in `ask` mode using the existing Host APIs. The question and selected excerpts form its prompt; this is not a full-history fork. It uses the existing project/global model configuration. The effective worktree path and SSH alias are passed to the connection.

- Main and side drafts remain separate. Quote cards can be removed. Failed connection/send retains the question and quote cards for retry.
- Events, sends, stops, permission decisions, and agent-question answers are scoped to the side session ID. Replies use the existing stream coalescer, Markdown renderer, and scroll-follow hook. A segment's `done` does not unlock send before the authoritative session state settles.
- The side chat supports follow-up messages, Stop, error details, permission controls, and agent questions. Side input does not trigger the main agent-question keyboard handler.
- Closing/reopening keeps the current draft and conversation. Switching the main chat hides its side panel while retaining its draft, quotes, connection, and original project binding; returning restores it. Background replies continue updating their own side session. This state lives for the mounted workbench lifetime; unsent drafts are not persisted across app restart.
- “Open chat” opens the saved side session as a normal main conversation. Narrow chat columns use an overlay so the side input remains usable beside an open resource pane or in a narrow window.

No changes to ACP transport, network parsing, backend process scheduling, authentication, or persistent storage schema are required.

## Validation

- Full frontend suite during implementation: 668 files / 7,621 tests passed.
- Final focused suite after the last changes: 7 files / 75 tests passed, including side stream isolation, deferred creation, follow-ups, immediate turn completion, stop targeting, error recovery, pending-request navigation, quote routing, main-draft preservation, toolbar dismissal, and side/main keyboard separation.
- Fifteen locale catalogs remain aligned. TypeScript, Vite build, targeted ESLint and whitespace checks pass; existing Vite large-chunk warnings remain.
- Local browser fixture verified real drag-selection, both action labels, quote transfer, input focus, dark/light themes, bottom/right placement, and a 620px-wide viewport. The temporary fixture was removed afterward.
- Host calls were mocked for automated interaction tests. No real model request or packaged macOS WebView end-to-end test was run, and no new installer was produced in this task.

## Tool activity (2026-10-04)

Side chats listen to session-scoped tool events and display the current running
(or most recent) tool using the main transcript's existing tool row. Its busy,
failure, and expandable-result styles stay consistent with the main chat. Ordinary
thinking resumes after a tool completes while the turn remains active. Tool events
are batched; terminal tool states flush immediately. Stop/turn completion settles
unfinished indicators, and a new turn clears previous activity. Events from other
sessions cannot change this row. This is current-turn activity, not a separate board.
