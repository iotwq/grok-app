import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTarget, verifyArtifact, prepare, refresh } from "./prepare-bundled-runtime.mjs";

test("cross builds select target platform, not build machine", () => {
  assert.equal(resolveTarget({ TAURI_ENV_ARCH: "x86_64", TAURI_ENV_PLATFORM: "windows" }, "aarch64-apple-darwin"), "x86_64-pc-windows-msvc");
  assert.equal(resolveTarget({ TAURI_ENV_ARCH: "aarch64", TAURI_ENV_PLATFORM: "windows" }), "aarch64-pc-windows-msvc");
  assert.equal(resolveTarget({ TAURI_ENV_ARCH: "x86_64", TAURI_ENV_PLATFORM: "darwin" }), "x86_64-apple-darwin");
  assert.equal(resolveTarget({ TAURI_ENV_ARCH: "aarch64", TAURI_ENV_PLATFORM: "linux" }), "aarch64-unknown-linux-gnu");
  assert.equal(resolveTarget({}, "aarch64-apple-darwin"), "aarch64-apple-darwin");
  assert.throws(() => resolveTarget({ TAURI_ENV_ARCH: "arm", TAURI_ENV_PLATFORM: "android" }));
});

test("corrupt or missing runtime cannot pass packaging verification", async () => {
  const dir = await mkdtemp(join(tmpdir(), "grok-runtime-test-"));
  try {
    const path = join(dir, "runtime");
    const hash = createHash("sha256").update("official artifact fixture").digest("hex");
    await writeFile(path, "official artifact fixture");
    await verifyArtifact(path, hash);
    await writeFile(path, "damaged artifact");
    await assert.rejects(verifyArtifact(path, hash), /checksum mismatch/);
    await assert.rejects(verifyArtifact(join(dir, "missing"), hash), { code: "ENOENT" });
    await assert.rejects(prepare("unsupported-target"), /No pinned/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function refreshFixture(t, overrides = {}) {
  const projectRoot = await mkdtemp(join(tmpdir(), "grok-refresh-test-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const notices = join(projectRoot, "src-tauri/resources/grok-build");
  const binaries = join(projectRoot, "src-tauri/binaries");
  await mkdir(notices, { recursive: true });
  await mkdir(binaries, { recursive: true });
  const previous = { version: "1.0.34", noticesRevision: "a".repeat(40), artifacts: {} };
  await writeFile(join(notices, "runtime.json"), JSON.stringify(previous));
  await writeFile(join(notices, "LICENSE"), "Existing Apache license fixture");
  await writeFile(join(binaries, "grok-build-aarch64-apple-darwin"), "prior runtime");
  const requests = [];
  const fetchImpl = async url => {
    requests.push(url);
    const path = new URL(url).pathname;
    if (overrides.failure && path.includes(overrides.failure)) return new Response("Unavailable", { status: 503 });
    if (path.endsWith("/stable")) return new Response(overrides.version ?? "1.0.41\n");
    if (path.endsWith("/commits/main")) return Response.json({ sha: "b".repeat(40) });
    if (path.includes("/git/trees/")) return Response.json({ tree: (overrides.notices ?? [
      "LICENSE", "THIRD-PARTY-NOTICES", "crates/codegen/xai-grok-tools/THIRD_PARTY_NOTICES.md",
      "crates/codegen/xai-grok-mermaid/assets/Roboto-LICENSE.txt",
      "crates/notices.rs", "../LICENSE",
    ]).map(path => ({ type: "blob", path })) });
    if (url.startsWith("https://raw.githubusercontent.com/")) {
      return new Response(path.endsWith("/LICENSE") ? (overrides.license ?? "Existing Apache license fixture") : `Notice fixture: ${path}`);
    }
    if (path.startsWith("/grok-build-public-artifacts/cli/grok-")) return new Response(`Runtime fixture: ${path.split("/").pop()}`);
    throw new Error(`Unexpected fetch: ${url}`);
  };
  return { projectRoot, fetchImpl, notices, binaries, previous, requests };
}

test("refresh pins all stable artifacts and immutable notice revision before staging", async t => {
  const f = await refreshFixture(t);
  const manifest = await refresh(f);
  assert.equal(manifest.version, "1.0.41");
  assert.equal(manifest.noticesRevision, "b".repeat(40));
  assert.equal(Object.keys(manifest.artifacts).length, 6);
  for (const [target, artifact] of Object.entries(manifest.artifacts)) {
    const destination = join(f.binaries, `grok-build-${target}${target.includes("windows") ? ".exe" : ""}`);
    assert.equal(await readFile(destination, "utf8"), `Runtime fixture: ${artifact.file}`);
    await verifyArtifact(destination, artifact.sha256);
  }
  assert.deepEqual(JSON.parse(await readFile(join(f.notices, "runtime.json"), "utf8")), manifest);
  assert.match(await readFile(join(f.notices, "TOOLS-NOTICES.md"), "utf8"), /xai-grok-tools/);
  assert.match(await readFile(join(f.notices, "crates/codegen/xai-grok-mermaid/assets/Roboto-LICENSE.txt"), "utf8"), /Roboto-LICENSE/);
  assert.ok(!f.requests.some(url => url.includes("notices.rs") || url.includes("../")));
  assert.ok(!f.requests.filter(url => url.includes("raw.githubusercontent")).some(url => url.includes("/main/")));
});

test("already-current stable build checks the channel without replacing verified inputs", async t => {
  const f = await refreshFixture(t, { version: "1.0.34" });
  assert.deepEqual(await refresh(f), f.previous);
  assert.equal(f.requests.length, 1);
  assert.equal(await readFile(join(f.binaries, "grok-build-aarch64-apple-darwin"), "utf8"), "prior runtime");
});

for (const [name, overrides, error] of [
  ["stable endpoint unavailable", { failure: "/stable" }, /HTTP 503/],
  ["invalid stable version", { version: "../../not-a-version" }, /Invalid Grok Build stable version/],
  ["platform download fails", { failure: "grok-1.0.41-windows" }, /HTTP 503/],
  ["root license changes", { license: "Different license" }, /license changed/],
  ["required notices missing", { notices: ["LICENSE"] }, /notices missing/],
]) {
  test(`refresh aborts and preserves prior artifacts when ${name}`, async t => {
    const f = await refreshFixture(t, overrides);
    await assert.rejects(refresh(f), error);
    assert.deepEqual(JSON.parse(await readFile(join(f.notices, "runtime.json"), "utf8")), f.previous);
    assert.equal(await readFile(join(f.binaries, "grok-build-aarch64-apple-darwin"), "utf8"), "prior runtime");
    assert.equal(await readFile(join(f.notices, "LICENSE"), "utf8"), "Existing Apache license fixture");
    assert.deepEqual(await readdir(f.binaries), ["grok-build-aarch64-apple-darwin"]);
  });
}
