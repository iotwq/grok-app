/** Compact actions for selected transcript text. */
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { IconPlus, IconChat } from "@/components/icons";

export type TranscriptSelectionToolbarProps = {
  x: number;
  y: number;
  onAddQuote: () => void;
  onAskSideChat?: () => void;
  onClose: () => void;
  labels: { addQuote: string; askSideChat: string; selection: string };
};

export function TranscriptSelectionToolbar({
  x,
  y,
  onAddQuote,
  onAskSideChat,
  onClose,
  labels,
}: TranscriptSelectionToolbarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(x - rect.width / 2, window.innerWidth - rect.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
  }, [x, y, labels]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      ref={rootRef}
      className="sel-toolbar"
      style={{ left: x, top: y }}
      role="toolbar"
      aria-label={labels.selection}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" className="sel-toolbar__btn" onClick={onAddQuote}>
        <IconPlus size={14} />
        {labels.addQuote}
      </button>
      {onAskSideChat && (
        <>
          <span className="sel-toolbar__divider" aria-hidden="true" />
          <button
            type="button"
            className="sel-toolbar__btn"
            onClick={onAskSideChat}
          >
            <IconChat size={14} />
            {labels.askSideChat}
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
