/**
 * Owns transcript quote-toolbar state so ConversationThread does not
 * re-render on every selectionchange while dragging.
 */

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { setDraft } from "@/lib/composerDraftStore";
import {
  eventTargetElement,
  readTranscriptSelection,
  reduceSelectionBar,
  selectionBarFromRead,
  shouldCommitPointerUp,
  shouldCommitSelectionChange,
  type TranscriptSelectionBar,
} from "@/lib/transcriptSelectionBar";
import { TranscriptSelectionToolbar } from "@/components/TranscriptSelectionToolbar";
import type { TranscriptSelectionToolbarProps } from "@/components/TranscriptSelectionToolbar";
import { SideChatSelectionContext } from "@/components/TranscriptSideChat";

export type TranscriptSelectionToolbarHostProps = {
  scrollRef: { current: HTMLElement | null };
  sessionId?: string | null;
  onAddQuote?: (quote: {
    text: string;
    comment: string;
    sourceMessageId?: string;
  }) => void;
  enabled?: boolean;
  labels: TranscriptSelectionToolbarProps["labels"];
};

export function TranscriptSelectionToolbarHost({
  scrollRef,
  sessionId,
  onAddQuote,
  enabled = true,
  labels,
}: TranscriptSelectionToolbarHostProps) {
  const [bar, setBar] = useState<TranscriptSelectionBar | null>(null);
  const askSideChat = useContext(SideChatSelectionContext);
  const focusFrameRef = useRef(0);
  const primaryDownRef = useRef(false);
  const startedInTranscriptRef = useRef(false);

  useEffect(() => {
    setBar(null);
    return () => cancelAnimationFrame(focusFrameRef.current);
  }, [sessionId, enabled]);

  const close = useCallback(() => {
    setBar(null);
  }, []);

  useEffect(() => {
    let raf = 0;
    const commit = () => {
      const raw = readTranscriptSelection(
        window.getSelection(),
        scrollRef.current,
      );
      setBar((prev) =>
        reduceSelectionBar(prev, raw ? selectionBarFromRead(raw) : null),
      );
    };
    const queue = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        commit();
      });
    };
    const onSel = () => {
      if (
        !shouldCommitSelectionChange({
          primaryPointerDown: primaryDownRef.current,
        })
      ) {
        return;
      }
      if (enabled) queue();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = eventTargetElement(e.target);
      if (el?.closest(".sel-toolbar")) return;
      primaryDownRef.current = true;
      const root = scrollRef.current;
      const node = e.target instanceof Node ? e.target : null;
      startedInTranscriptRef.current = !!(root && node && root.contains(node));
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const started = startedInTranscriptRef.current;
      primaryDownRef.current = false;
      startedInTranscriptRef.current = false;
      if (enabled && shouldCommitPointerUp({ startedInTranscript: started }))
        queue();
    };
    const onContextMenu = (e: MouseEvent) => {
      const root = scrollRef.current;
      if (!(e.target instanceof Node) || !root?.contains(e.target)) return;
      // A resource's own menu takes precedence over an older text selection.
      if (eventTargetElement(e.target)?.closest("a[href], [data-output-resource], .file-path-card, .md-body__img-frame, .md-body__video-card, .attach-card")) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        setBar(null);
        return;
      }
      const raw = readTranscriptSelection(window.getSelection(), root);
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      setBar({ ...selectionBarFromRead(raw), x: e.clientX, y: e.clientY });
    };
    const onViewportChange = () => setBar(null);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    document.addEventListener("selectionchange", onSel);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      document.removeEventListener("selectionchange", onSel);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollRef, enabled]);

  useEffect(() => {
    if (!bar) return;
    const onDoc = (e: MouseEvent) => {
      const el = eventTargetElement(e.target);
      if (el?.closest(".sel-toolbar")) return;
      close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [bar, close]);

  if (!bar) return null;

  const excerpt = bar.text;
  const sourceMessageId = bar.sourceMessageId;

  return (
    <TranscriptSelectionToolbar
      x={bar.x}
      y={bar.y}
      onAskSideChat={
        askSideChat
          ? () => {
              close();
              window.getSelection()?.removeAllRanges();
              askSideChat({ text: excerpt, comment: "", sourceMessageId });
            }
          : undefined
      }
      onAddQuote={() => {
        const trimmed = excerpt.trim();
        if (!trimmed) return;
        if (onAddQuote) {
          onAddQuote({
            text: trimmed,
            comment: "",
            sourceMessageId,
          });
        } else {
          setDraft((prev) => {
            if (!prev) return trimmed;
            return /\s$/.test(prev) ? prev + trimmed : prev + "\n\n" + trimmed;
          });
        }
        close();
        window.getSelection()?.removeAllRanges();
        const el = scrollRef.current
          ?.closest(".main__stage")
          ?.querySelector<HTMLElement>(".composer__input");
        focusFrameRef.current = requestAnimationFrame(() => {
          if (!el || el.getAttribute("contenteditable") === "false") return;
          el.focus({ preventScroll: true });
        });
      }}
      onClose={close}
      labels={labels}
    />
  );
}
