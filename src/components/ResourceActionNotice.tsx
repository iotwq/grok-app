import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Feedback stays outside transcript layout so actions never move the scroll. */
export function useResourceActionFeedback() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!message || busy) return;
    const timer = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [message, busy]);

  const run = async (
    action: () => unknown | Promise<unknown>,
    failed: string,
    success?: string,
    working?: string,
  ) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage(working ?? null);
    try {
      const result = await action();
      if (mounted.current) setMessage(result === false ? null : success ?? null);
    } catch {
      if (mounted.current) setMessage(failed);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return {
    busy,
    run,
    notice: message && typeof document !== "undefined"
      ? createPortal(
          <div className="app-toast resource-action-notice" role="status">{message}</div>,
          document.body,
        )
      : null,
  };
}
