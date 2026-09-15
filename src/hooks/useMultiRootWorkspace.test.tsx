// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useMultiRootWorkspace } from "./useMultiRootWorkspace";
import type { WorkspaceRecord } from "@/lib/multiRootWorkspace";
import * as api from "@/lib/api";
vi.mock("@/lib/api", () => ({
  settingsGet: vi.fn().mockResolvedValue({ sessionDataMode: "independent" }),
  workspaceGet: vi.fn(), workspacesForProject: vi.fn(), workspaceUpsert: vi.fn(),
  sessionSetWorkspace: vi.fn(), settingsSet: vi.fn().mockResolvedValue({}),
  pickDirectory: vi.fn(), workspaceValidateRoot: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const ws = (id: string): WorkspaceRecord => ({ id, name: id, primaryProjectId: id,
  roots: [{ path: `/test/${id}`, role: "primary", access: "write" }],
  capability: "contextOnly", updatedAt: "2026-09-15" });
const target = (id: string) => ({ projectId: id, projectName: id, projectPath: `/test/${id}`, sessionId: `session-${id}`, workspaceId: id });

it("ignores an old project's late load and saves only the current draft", async () => {
  const a = deferred<WorkspaceRecord>();
  vi.mocked(api.workspaceGet).mockImplementation(async id => id === "a" ? a.promise : ws("b"));
  const { result } = renderHook(() => useMultiRootWorkspace());
  let first!: Promise<void>;
  await act(async () => { first = result.current.openFor(target("a")); });
  act(() => result.current.close());
  await act(async () => { await result.current.openFor(target("b")); });
  await act(async () => { a.resolve(ws("a")); await first; });
  expect(result.current.draft?.id).toBe("b");
  vi.mocked(api.workspaceUpsert).mockResolvedValue(ws("b"));
  await act(async () => { await result.current.save(); });
  expect(api.workspaceUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: "b", primaryProjectId: "b", roots: ws("b").roots }));
});
it("discards a directory picker result after switching projects", async () => {
  vi.mocked(api.workspaceGet).mockImplementation(async id => ws(id));
  const picked = deferred<string | null>();
  vi.mocked(api.pickDirectory).mockReturnValue(picked.promise);
  const { result } = renderHook(() => useMultiRootWorkspace());
  await act(async () => { await result.current.openFor(target("a")); });
  let pending!: Promise<void>;
  act(() => { pending = result.current.addExtraRoot(); });
  await act(async () => { await result.current.openFor(target("b")); });
  await act(async () => { picked.resolve("/extra"); await pending; });
  expect(api.workspaceValidateRoot).not.toHaveBeenCalled();
  expect(result.current.draft).toEqual(ws("b"));
});
it("does not bind or close a new dialog after a stale save resolves", async () => {
  vi.mocked(api.workspaceGet).mockImplementation(async id => ws(id));
  const saved = deferred<WorkspaceRecord>();
  vi.mocked(api.workspaceUpsert).mockReturnValue(saved.promise);
  const { result } = renderHook(() => useMultiRootWorkspace());
  await act(async () => { await result.current.openFor(target("a")); });
  let pending!: ReturnType<typeof result.current.save>;
  act(() => { pending = result.current.save(); });
  await act(async () => { await result.current.openFor(target("b")); });
  await act(async () => { saved.resolve(ws("a")); expect(await pending).toBeNull(); });
  expect(api.sessionSetWorkspace).not.toHaveBeenCalled();
  expect(result.current.open).toBe(true);
  expect(result.current.draft?.id).toBe("b");
});
