import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createT, type Locale } from "@/i18n";
import * as api from "@/lib/api";
import type { Project, SessionRow } from "@/lib/app/sidebarModels";
import {
  makeComposerQuoteId,
  parseQuotesFromContent,
  type ComposerQuote,
} from "@/lib/composerQuotes";
import { shouldSendOnKeydown } from "@/lib/composerSendKey";
import { formatTurnErrorBody, type AskUserPayload } from "@/lib/session";
import {
  mapPermissionButtons,
  displayPermissionPreview,
} from "@/lib/permissionOptions";
import { useComposerSendKeyPref } from "@/hooks/useComposerSendKeyPref";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { useTranscriptSideChat } from "@/hooks/useTranscriptSideChat";
import { IconArrowUp, IconChat, IconClose, IconStop } from "@/components/icons";
import { MarkdownBody } from "@/components/MarkdownBody";
import { TimelineToolRow, toolSegmentFromMessage } from "@/components/lobe-chat/TimelineToolRow";
import { AskUserForm } from "@/components/AskUserForm";
import { useAskUserQuestionnaire } from "@/hooks/useAskUserQuestionnaire";

export type SelectedQuote = Omit<ComposerQuote, "id">;
export const SideChatSelectionContext = createContext<
  ((quote: SelectedQuote) => void) | null
>(null);

type Props = {
  children: ReactNode;
  sourceKey: string;
  locale: Locale;
  project: Project | null;
  projectPath: string | null;
  onOpenSession: (
    session: SessionRow,
    project: Project | null,
  ) => Promise<void>;
};

export function ChatWithSideChat({ children, sourceKey, ...props }: Props) {
  type SideChat = { quotes: ComposerQuote[]; opened: boolean; project: Project | null; projectPath: string | null };
  const [chats, setChats] = useState<Record<string, SideChat>>({});
  const ask = useCallback((quote: SelectedQuote) => {
    setChats(prev => ({ ...prev, [sourceKey]: {
      ...(prev[sourceKey] ?? { project: props.project, projectPath: props.projectPath }),
      opened: true,
      quotes: [...(prev[sourceKey]?.quotes ?? []), { ...quote, id: makeComposerQuoteId() }],
    } }));
  }, [sourceKey, props.project, props.projectPath]);
  const setOpened = (key: string, opened: boolean) => setChats(prev => ({
    ...prev, [key]: { ...prev[key], opened },
  }));
  return (
    <SideChatSelectionContext.Provider value={ask}>
      <div className="chat-with-side">
        {children}
        {Object.entries(chats).map(([key, chat]) => (
          <div key={key} style={{ display: key === sourceKey ? "contents" : "none" }}>
            <TranscriptSideChat
              {...props}
              project={chat.project}
              projectPath={chat.projectPath}
              opened={key === sourceKey && chat.opened}
              quotes={chat.quotes}
              setQuotes={next => setChats(prev => ({ ...prev, [key]: {
                ...prev[key], quotes: typeof next === "function" ? next(prev[key].quotes) : next,
              } }))}
              onClose={() => setOpened(key, false)}
              onReopen={() => setOpened(key, true)}
            />
          </div>
        ))}
      </div>
    </SideChatSelectionContext.Provider>
  );
}

function TranscriptSideChat({
  locale,
  project,
  projectPath,
  onOpenSession,
  opened,
  quotes,
  setQuotes,
  onClose,
  onReopen,
}: Omit<Props, "children" | "sourceKey"> & {
  opened: boolean;
  quotes: ComposerQuote[];
  setQuotes: Dispatch<SetStateAction<ComposerQuote[]>>;
  onClose: () => void;
  onReopen: () => void;
}) {
  const tr = useMemo(() => createT(locale), [locale]);
  const chat = useTranscriptSideChat(project, projectPath);
  const tool = chat.toolActivity ? toolSegmentFromMessage(chat.toolActivity) : null;
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendPref = useComposerSendKeyPref();
  const { viewportRef, contentRef, onScroll, scrollToBottom, showBack } =
    useStickToBottom({
      conversationKey: chat.session?.id,
      forceStickKey: chat.messages.filter((m) => m.role === "user").length,
      enabled: opened,
    });
  useEffect(() => {
    if (opened) inputRef.current?.focus({ preventScroll: true });
  }, [opened, quotes.length]);

  const submit = async () => {
    if (
      chat.busy ||
      !draft.trim() ||
      (project && (!project.trusted || !project.pathOk))
    )
      return;
    const sentDraft = draft;
    const sentQuotes = quotes;
    const ok = await chat.send(
      sentDraft,
      sentQuotes,
      `${tr("chat.sideChatTitle")} · ${quotes[0]?.text.slice(0, 40) || draft.slice(0, 40)}`,
    );
    if (!ok) return;
    setDraft((current) => (current === sentDraft ? "" : current));
    setQuotes((current) =>
      current.filter((q) => !sentQuotes.some((sent) => sent.id === q.id)),
    );
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      {!opened && (
        <button
          type="button"
          className="side-chat-reopen btn btn--ghost"
          onClick={onReopen}
        >
          <IconChat size={14} />
          {tr("chat.sideChatTitle")}
        </button>
      )}
      <aside
        className="side-chat"
        aria-label={tr("chat.sideChatTitle")}
        hidden={!opened}
      >
        <header className="side-chat__header">
          <span>
            <IconChat size={16} />
            {tr("chat.sideChatTitle")}
          </span>
          <div>
            {chat.session && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() =>
                  void onOpenSession(chat.session!, project).then(onClose)
                }
              >
                {tr("chat.sideChatOpen")}
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              aria-label={tr("common.close")}
              onClick={onClose}
            >
              <IconClose size={16} />
            </button>
          </div>
        </header>
        <div
          className="side-chat__messages"
          ref={viewportRef}
          onScroll={onScroll}
        >
          <div ref={contentRef}>
            {!chat.messages.length && (
              <p className="side-chat__empty">{tr("chat.sideChatEmpty")}</p>
            )}
            {chat.messages
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => {
                const parsed = parseQuotesFromContent(m.content);
                return (
                  <div
                    key={m.id}
                    className={`side-chat__message side-chat__message--${m.role}`}
                  >
                    {parsed.quotes.map((q, index) => (
                      <blockquote key={index}>{q.text}</blockquote>
                    ))}
                    {m.role === "assistant" ? (
                      <MarkdownBody locale={locale} streaming={m.streaming}>
                        {m.isError
                          ? formatTurnErrorBody({ content: m.content }, locale)
                          : m.content}
                      </MarkdownBody>
                    ) : (
                      <span>{parsed.text}</span>
                    )}
                  </div>
                );
              })}
            {tool && <TimelineToolRow tool={tool} locale={locale} />}
            {chat.busy && !tool?.streaming && (
              <div className="side-chat__status" role="status">
                {chat.submitting ? tr("main.connecting") : tr("chat.thinking")}
              </div>
            )}
          </div>
        </div>
        {showBack && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => scrollToBottom()}
          >
            {tr("chat.scrollBottom")}
          </button>
        )}
        {chat.error && (
          <div className="side-chat__error" role="alert">
            {formatTurnErrorBody({ message: chat.error }, locale)}
            <details>
              <summary>{tr("error.details")}</summary>
              {chat.error}
            </details>
          </div>
        )}
        {chat.permission && (
          <div className="side-chat__gate">
            <p>{chat.permission.title || chat.permission.toolName}</p>
            {displayPermissionPreview(chat.permission.preview) && (
              <pre>{displayPermissionPreview(chat.permission.preview)}</pre>
            )}
            {mapPermissionButtons(
              chat.permission.options,
              {
                allowOnce: tr("perm.allowOnce"),
                allowSession: tr("perm.allowSession"),
                deny: tr("perm.deny"),
              },
              chat.permission.toolName,
            ).map((button) => (
              <button
                type="button"
                className="btn btn--ghost"
                key={button.optionId}
                disabled={chat.gateBusy}
                onClick={() => {
                  const permission = chat.permission!;
                  void chat
                    .resolveGate(async () => {
                      await api.sessionResolvePermission({
                        ...permission,
                        decision: button.decision,
                        optionId: button.optionId,
                      });
                      chat.setPermission(null);
                    })
                    .catch(() => {});
                }}
              >
                {button.label}
              </button>
            ))}
          </div>
        )}
        <SideChatQuestion
          payload={chat.askUser}
          tr={tr}
          onResolve={(decision, answers) =>
            chat.resolveGate(async () => {
              await api.sessionResolveAskUser({
                decision,
                answers,
                rpcId: chat.askUser?.rpcId,
                sessionId: chat.session?.id,
              });
              chat.setAskUser(null);
            })
          }
        />
        <form
          className="side-chat__composer"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {quotes.length > 0 && (
            <div className="side-chat__quotes">
              {quotes.map((q) => (
                <div className="side-chat__quote" key={q.id}>
                  <blockquote>{q.text}</blockquote>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={tr("chat.sideChatRemoveQuote")}
                    onClick={() =>
                      setQuotes((prev) =>
                        prev.filter((item) => item.id !== q.id),
                      )
                    }
                  >
                    <IconClose size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            rows={3}
            value={draft}
            aria-label={tr("chat.sideChatPlaceholder")}
            placeholder={tr("chat.sideChatPlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (
                !e.nativeEvent.isComposing &&
                shouldSendOnKeydown(e, sendPref)
              ) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="side-chat__footer">
            {chat.busy ? (
              <button
                type="button"
                className="icon-btn"
                disabled={chat.submitting}
                aria-label={tr("composer.stop")}
                onClick={() => void chat.stop()}
              >
                <IconStop size={16} />
              </button>
            ) : (
              <button
                type="submit"
                className="side-chat__send icon-btn"
                disabled={
                  !draft.trim() ||
                  (!!project && (!project.trusted || !project.pathOk))
                }
                aria-label={tr("composer.send")}
              >
                <IconArrowUp size={16} />
              </button>
            )}
          </div>
        </form>
      </aside>
    </>
  );
}

/** Local form events cannot consume Enter in the main composer. */
function SideChatQuestion({
  payload,
  tr,
  onResolve,
}: {
  payload: AskUserPayload | null;
  tr: ReturnType<typeof createT>;
  onResolve: (
    decision: "accepted" | "cancelled",
    answers?: Record<string, string>,
  ) => Promise<void>;
}) {
  const form = useAskUserQuestionnaire(payload, 0, () =>
    onResolve("cancelled"),
  );
  if (!form.open) return null;
  return (
    <form
      className="side-chat__gate"
      onKeyDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        if (form.canSubmit)
          void form
            .submit((answers) => onResolve("accepted", answers))
            .catch(() => {});
      }}
    >
      <AskUserForm
        idPrefix="side-chat-question"
        questions={form.questions}
        selected={form.selected}
        freeText={form.freeText}
        busy={form.busy}
        onToggleOption={form.toggleOption}
        onFreeText={form.writeFreeText}
        labels={{
          otherPlaceholder: tr("askUser.otherPlaceholder"),
          freeTextHint: tr("askUser.freeTextHint"),
          multiHint: tr("askUser.multiHint"),
        }}
      />
      <button
        type="submit"
        className="btn btn--primary"
        disabled={!form.canSubmit || form.busy}
      >
        {tr("askUser.submit")}
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={form.busy}
        onClick={() => void form.cancel().catch(() => {})}
      >
        {tr("askUser.cancel")}
      </button>
    </form>
  );
}
