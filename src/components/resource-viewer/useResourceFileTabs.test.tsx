/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useResourceFileTabs } from "./useResourceFileTabs";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  isTauri: () => true,
  fsReadAbsolute: vi.fn(), fsReadFile: vi.fn(),
  fsWriteFile: vi.fn(), fsWriteAbsolute: vi.fn(),
}));
vi.mock("@/lib/filePreviewSrc", () => ({ resolvePreviewSrc: async () => null }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const tr = (key: string) => key;
function read(absolutePath: string, text: string): api.FsReadResult {
  const name = absolutePath.split("/").at(-1)!;
  return { absolutePath, relativePath: name, name, kind: "markdown", text,
    mtimeMs: 10, size: text.length, mime: "text/markdown", base64: null,
    stream: false, truncated: false, error: null };
}
function setup() {
  vi.mocked(api.fsReadAbsolute).mockImplementation(async (path) => read(path, path));
  vi.mocked(api.fsReadFile).mockImplementation(async (root, rel) => read(`${root}/${rel}`, rel));
  return renderHook(() => useResourceFileTabs({ projectPath: "/project", sideMode: "files", tr, setError: vi.fn() }));
}

it("reloads and saves an external file without redirecting to the project", async () => {
  const { result } = setup();
  await act(async () => { await result.current.openAbsoluteFile("/external/readme.md"); });
  await act(async () => { await result.current.reloadActiveFile(); });
  expect(api.fsReadFile).not.toHaveBeenCalled();
  expect(result.current.activeTab?.absolutePath).toBe("/external/readme.md");
  act(() => result.current.updateActiveDraft("edited external"));
  vi.mocked(api.fsWriteAbsolute).mockResolvedValue({ absolutePath: "/external/readme.md", relativePath: "readme.md", mtimeMs: 20, size: 15 });
  await act(async () => { await result.current.saveActiveFile(); });
  expect(api.fsWriteAbsolute).toHaveBeenCalledWith("/external/readme.md", "edited external", 10);
  expect(api.fsWriteFile).not.toHaveBeenCalled();
});

it("keeps an external file separate from a same-name project tree file", async () => {
  const { result } = setup();
  await act(async () => { await result.current.openAbsoluteFile("/external/readme.md"); });
  await act(async () => { await result.current.openFile("readme.md"); });
  expect(result.current.tabs).toHaveLength(2);
  expect(result.current.activeTab?.absolutePath).toBe("/project/readme.md");
  await act(async () => { await result.current.openAbsoluteFile("/external/readme.md"); });
  expect(result.current.tabs).toHaveLength(2);
  expect(result.current.activeTab?.absolutePath).toBe("/external/readme.md");
});

it("reuses project-relative and absolute opens of the same project file", async () => {
  const { result } = setup();
  await act(async () => { await result.current.openAbsoluteFile("/project/readme.md"); });
  await act(async () => { await result.current.openFile("readme.md"); });
  expect(result.current.tabs).toHaveLength(1);
  await act(async () => { await result.current.reloadActiveFile(); });
  expect(api.fsReadFile).toHaveBeenCalledWith("/project", "readme.md");
});

for (const action of ["overwrite", "reload"] as const) {
  it(`resolves ${action} on the conflicted file after switching tabs`, async () => {
    const { result } = setup();
    await act(async () => { await result.current.openFile("A.md"); });
    const idA = result.current.activeId!;
    act(() => result.current.updateActiveDraft("edited A"));
    let rejectWrite!: (error: Error) => void;
    vi.mocked(api.fsWriteFile).mockImplementationOnce(() => new Promise((_, reject) => { rejectWrite = reject; }));
    let save!: Promise<void>;
    act(() => { save = result.current.saveActiveFile(); });
    await act(async () => { await result.current.openFile("B.md"); });
    act(() => result.current.updateActiveDraft("edited B"));
    await act(async () => { rejectWrite(new Error("CONFLICT: changed on disk")); await save; });
    expect(result.current.conflictTabId).toBe(idA);
    vi.mocked(api.fsWriteFile).mockResolvedValue({ absolutePath: "/project/A.md", relativePath: "A.md", mtimeMs: 20, size: 8 });
    await act(async () => {
      if (action === "overwrite") await result.current.saveActiveFile({ force: true, tabId: result.current.conflictTabId });
      else await result.current.reloadActiveFile(result.current.conflictTabId);
    });
    if (action === "overwrite") expect(api.fsWriteFile).toHaveBeenLastCalledWith("/project", "A.md", "edited A", null);
    else expect(api.fsReadFile).toHaveBeenLastCalledWith("/project", "A.md");
    expect(result.current.activeTab?.absolutePath).toBe("/project/B.md");
    expect(result.current.activeTab?.draftText).toBe("edited B");
    expect(result.current.activeTab?.mtimeMs).toBe(10);
    expect(result.current.tabs.find((tab) => tab.id === idA)?.draftText).toBe(action === "overwrite" ? "edited A" : "A.md");
  });
}
