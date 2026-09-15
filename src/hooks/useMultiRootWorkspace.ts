/**
 * Multi-root workspace modal state (#1194 MVP-0).
 * Keep out of AppWorkbench — pass thin callbacks only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import type { WorkspaceRecord, WorkspaceRoot } from "@/lib/multiRootWorkspace";
import {
  MAX_EXTRA_WORKSPACE_ROOTS,
  extraRoots,
  primaryRoot,
} from "@/lib/multiRootWorkspace";

export type MultiRootWorkspaceTarget = {
  projectId: string;
  projectName: string;
  projectPath: string;
  sessionId: string | null;
  workspaceId: string | null;
};

export function useMultiRootWorkspace() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<MultiRootWorkspaceTarget | null>(null);
  const [draft, setDraft] = useState<WorkspaceRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeCapableMode, setWriteCapableMode] = useState(false);

  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);

  const close = useCallback(() => {
    generation.current += 1;
    setOpen(false);
    setTarget(null);
    setDraft(null);
    setError(null);
    setBusy(false);
  }, []);

  const openFor = useCallback(async (next: MultiRootWorkspaceTarget) => {
    const request = ++generation.current;
    setDraft(null);
    setTarget(next);
    setOpen(true);
    setError(null);
    setBusy(true);
    try {
      try {
        const settings = await api.settingsGet();
        if (request !== generation.current) return;
        setWriteCapableMode(
          (settings.sessionDataMode || "").toLowerCase() === "independent",
        );
      } catch {
        if (request !== generation.current) return;
        setWriteCapableMode(false);
      }
      let ws: WorkspaceRecord | null = null;
      if (next.workspaceId) {
        ws = (await api.workspaceGet(next.workspaceId)) ?? null;
      }
      if (request !== generation.current) return;
      if (!ws) {
        const list = await api.workspacesForProject(next.projectId);
        ws = list[0] ?? null;
      }
      if (!ws) {
        ws = {
          id: "",
          name: `${next.projectName} workspace`,
          primaryProjectId: next.projectId,
          roots: [
            {
              path: next.projectPath,
              role: "primary",
              access: "write",
              pathOk: true,
            },
          ],
          capability: "contextOnly",
          updatedAt: new Date().toISOString(),
        };
      }
      if (request !== generation.current) return;
      setDraft(ws);
    } catch (e) {
      if (request !== generation.current) return;
      setError(String(e));
      setDraft(null);
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }, []);

  const addExtraRoot = useCallback(async () => {
    if (!draft || busy) return;
    const request = generation.current;
    if (extraRoots(draft).length >= MAX_EXTRA_WORKSPACE_ROOTS) {
      setError(`max ${MAX_EXTRA_WORKSPACE_ROOTS}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const picked = await api.pickDirectory();
      if (!picked || request !== generation.current) return;
      const validated = await api.workspaceValidateRoot(picked);
      if (request !== generation.current) return;
      const path = validated.path;
      if (draft.roots.some((r) => r.path === path)) {
        setError("duplicate");
        return;
      }
      setDraft({
        ...draft,
        roots: [
          ...draft.roots,
          {
            path,
            role: "extra",
            access: "read",
            pathOk: validated.pathOk ?? true,
          },
        ],
      });
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }, [draft, busy]);

  const removeExtraRoot = useCallback(
    (path: string) => {
      if (!draft) return;
      setDraft({
        ...draft,
        roots: draft.roots.filter(
          (r) => !(r.role === "extra" && r.path === path),
        ),
      });
    },
    [draft],
  );

  const setExtraAccess = useCallback(
    (path: string, access: "read" | "write") => {
      if (!draft) return;
      setDraft({
        ...draft,
        roots: draft.roots.map((r) =>
          r.role === "extra" && r.path === path ? { ...r, access } : r,
        ),
      });
    },
    [draft],
  );

  const save = useCallback(async () => {
    if (!draft || !target || busy || draft.primaryProjectId !== target.projectId) return null;
    const request = generation.current;
    setBusy(true);
    setError(null);
    try {
      const roots: WorkspaceRoot[] = draft.roots.slice();
      const saved = await api.workspaceUpsert({
        id: draft.id || null,
        name: draft.name,
        primaryProjectId: target.projectId,
        roots,
      });
      if (request !== generation.current) return null;
      if (target.sessionId) {
        await api.sessionSetWorkspace(target.sessionId, saved.id);
      }
      if (request !== generation.current) return null;
      try {
        await api.settingsSet({ recentWorkspaceId: saved.id });
      } catch {
        /* soft */
      }
      if (request !== generation.current) return null;
      setDraft(saved);
      return saved;
    } catch (e) {
      if (request === generation.current) setError(String(e));
      return null;
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }, [draft, target, busy]);

  const clearBinding = useCallback(async (): Promise<boolean> => {
    if (!target?.sessionId || busy) return false;
    const request = generation.current;
    setBusy(true);
    setError(null);
    try {
      await api.sessionSetWorkspace(target.sessionId, null);
      return request === generation.current;
    } catch (e) {
      if (request === generation.current) setError(String(e));
      return false;
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }, [target, busy]);

  useEffect(() => {
    if (!open) return;
    // Keep primary path label fresh when target changes.
    if (draft && target && primaryRoot(draft)?.path !== target.projectPath) {
      /* leave user edits alone */
    }
  }, [open, draft, target]);

  return {
    open,
    target,
    draft,
    setDraft,
    busy,
    error,
    openFor,
    close,
    addExtraRoot,
    removeExtraRoot,
    setExtraAccess,
    save,
    clearBinding,
    writeCapableMode,
  };
}
