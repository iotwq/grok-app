/** Side-chat UI over the existing session-targeted Host API. */
import { useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import type { Project, SessionRow } from "@/lib/app/sidebarModels";
import {
  appendQuotesToContent,
  serializeQuotesForAgent,
  type ComposerQuote,
} from "@/lib/composerQuotes";
import {
  applyStreamChunk,
  applyToolEvent,
  pickRunningTurnTool,
  type ToolEventPayload,
  IDLE_SNAPSHOT,
  type AskUserPayload,
  type ChatMessage,
  type PermissionPayload,
  type SessionSnapshot,
  type StreamPayload,
  type TurnErrorPayload,
} from "@/lib/session";
import { StreamCoalescer, TimedBatchQueue, toolEventNeedsImmediateFlush } from "@/lib/streamCoalesce";
import { mapStoredMessagesToChat } from "@/lib/mapStoredMessages";

export function useTranscriptSideChat(
  project: Project | null,
  projectPath: string | null,
) {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(IDLE_SNAPSHOT);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<ChatMessage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionPayload | null>(null);
  const [askUser, setAskUser] = useState<AskUserPayload | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const sessionRef = useRef<SessionRow | null>(null);
  const sendingRef = useRef(false);
  const activeRef = useRef(false);
  const mountedRef = useRef(true);
  const readyRef = useRef<Promise<void>>(Promise.resolve());
  const turnRef = useRef(0);
  const acceptSnapshotRef = useRef<(next: SessionSnapshot) => void>(() => {});

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const stream = new StreamCoalescer({
      onFlush: (chunk) => {
        if (!disposed)
          setMessages((prev) => applyStreamChunk(prev, chunk as StreamPayload));
      },
    });
    const toolEvents = new TimedBatchQueue<ToolEventPayload>({
      flushMs: 48,
      shouldFlushImmediate: event => toolEventNeedsImmediateFlush(event.status),
      onFlush: events => {
        if (!disposed) setTools(prev => events.reduce(applyToolEvent, prev));
      },
    });
    const settleTools = () => {
      toolEvents.flushAll();
      setTools(prev => prev.map(tool => tool.streaming
        ? { ...tool, streaming: false, toolStatus: "cancelled" } : tool));
    };
    const hydrate = async (id: string, turn: number) => {
      try {
        const rows = await api.sessionMessages(id);
        if (!disposed && turn === turnRef.current && !activeRef.current) {
          setMessages(mapStoredMessagesToChat(rows));
        }
      } catch (e) {
        if (!disposed) setError(String(e));
      }
    };
    const onState = (next: SessionSnapshot) => {
      if (disposed || next.sessionId !== sessionRef.current?.id) return;
      setSnapshot(next);
      if (next.lastError) setError(next.lastError.message);
      if (next.state === "ready" || next.state === "disconnected") {
        stream.flushAll();
        settleTools();
        setPermission(null);
        setAskUser(null);
        if (activeRef.current) {
          activeRef.current = false;
          void hydrate(next.sessionId!, turnRef.current);
        }
      }
    };
    acceptSnapshotRef.current = onState;
    const track = async (pending: Promise<() => void>) => {
      const unlisten = await pending;
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    };
    readyRef.current = Promise.all([
      track(
        api.listen<StreamPayload>("session://stream", (chunk) => {
          if (chunk.sessionId === sessionRef.current?.id) stream.push(chunk);
        }),
      ),
      track(api.listen<ToolEventPayload>("session://tool", event => {
        if (!disposed && activeRef.current && event.sessionId === sessionRef.current?.id) toolEvents.push(event);
      })),
      track(api.listen<SessionSnapshot>("session://state", onState)),
      track(api.listen<SessionSnapshot>("session://runtime", onState)),
      track(
        api.listen<TurnErrorPayload>("session://turn_error", (p) => {
          if (disposed || p.sessionId !== sessionRef.current?.id) return;
          stream.flushAll();
          settleTools();
          activeRef.current = false;
          setPermission(null);
          setAskUser(null);
          setError([p.code, p.message || p.content].filter(Boolean).join(": "));
          setSnapshot((prev) => ({ ...prev, state: "ready" }));
        }),
      ),
      track(
        api.listen<PermissionPayload>("session://permission", (p) => {
          if (!disposed && p.sessionId === sessionRef.current?.id)
            setPermission(p);
        }),
      ),
      track(
        api.listen<AskUserPayload>("session://ask_user", (p) => {
          if (!disposed && p.sessionId === sessionRef.current?.id)
            setAskUser(p);
        }),
      ),
      track(
        api.listen<{ sessionId: string }>("session://ask_user_cleared", (p) => {
          if (!disposed && p.sessionId === sessionRef.current?.id)
            setAskUser(null);
        }),
      ),
    ]).then(() => {});
    void readyRef.current.catch((e) => {
      if (!disposed) setError(String(e));
    });
    return () => {
      disposed = true;
      mountedRef.current = false;
      stream.dispose();
      toolEvents.dispose();
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const busy =
    submitting ||
    snapshot.state === "streaming" ||
    snapshot.state === "awaiting_permission";
  const send = async (
    text: string,
    quotes: ComposerQuote[],
    title: string,
  ): Promise<boolean> => {
    if (!text.trim() || sendingRef.current || activeRef.current) return false;
    sendingRef.current = true;
    setSubmitting(true);
    setError(null);
    let optimisticId: string | null = null;
    try {
      await readyRef.current;
      if (!mountedRef.current) return false;
      if (!sessionRef.current) {
        const created = (await api.sessionCreate(
          project?.id,
          title,
        )) as SessionRow;
        sessionRef.current = created;
        if (!mountedRef.current) return false;
        setSession(created);
      }
      const id = sessionRef.current.id;
      const connected = await api.sessionConnect({
        sessionId: id,
        projectPath: projectPath ?? undefined,
        sshAlias: project?.sshAlias,
        mode: "ask",
      });
      if (!mountedRef.current) return false;
      if (connected.lastError) throw new Error(connected.lastError.message);
      if (connected.sessionId !== id || connected.state !== "ready")
        throw new Error("CONNECT_FAILED");
      setTools([]);
      turnRef.current += 1;
      activeRef.current = true;
      optimisticId = `u-local-side-${crypto.randomUUID()}`;
      const display = appendQuotesToContent(text, quotes);
      setMessages((prev) => [
        ...prev,
        { id: optimisticId!, role: "user", content: display },
      ]);
      setSnapshot({ ...connected, state: "streaming" });
      const sent = await api.sessionSend(
        serializeQuotesForAgent(quotes, text),
        display,
        id,
      );
      if (mountedRef.current && activeRef.current)
        acceptSnapshotRef.current(sent);
      return true;
    } catch (e) {
      activeRef.current = false;
      if (mountedRef.current) {
        setError(String(e));
        setSnapshot((prev) => ({ ...prev, state: "ready" }));
        if (optimisticId)
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
      return false;
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const stop = async () => {
    const id = sessionRef.current?.id;
    if (!id || submitting) return;
    try {
      const stopped = await api.sessionStop(id);
      if (mountedRef.current) acceptSnapshotRef.current(stopped);
    } catch (e) {
      setError(String(e));
    }
  };
  const resolveGate = async (run: () => Promise<unknown>) => {
    if (gateBusy) return;
    setGateBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setGateBusy(false);
    }
  };
  return {
    session,
    snapshot,
    messages,
    toolActivity: pickRunningTurnTool(tools) ?? tools.at(-1) ?? null,
    busy,
    submitting,
    error,
    permission,
    askUser,
    gateBusy,
    send,
    stop,
    resolveGate,
    setPermission,
    setAskUser,
  };
}
