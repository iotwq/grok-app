// Refresh the official stable runtime for release builds, then stage a verified binary.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactBase = "https://storage.googleapis.com/grok-build-public-artifacts/cli";
const sourceApi = "https://api.github.com/repos/xai-org/grok-build";
const platforms = {
  "aarch64-apple-darwin": "macos-aarch64",
  "x86_64-apple-darwin": "macos-x86_64",
  "x86_64-pc-windows-msvc": "windows-x86_64.exe",
  "aarch64-pc-windows-msvc": "windows-aarch64.exe",
  "x86_64-unknown-linux-gnu": "linux-x86_64",
  "aarch64-unknown-linux-gnu": "linux-aarch64",
};
const noticeAliases = {
  "third_party/NOTICE": "VENDORED-NOTICE",
  "third_party/mermaid-to-svg/LICENSE": "MERMAID-LICENSE",
  "crates/codegen/xai-grok-tools/THIRD_PARTY_NOTICES.md": "TOOLS-NOTICES.md",
};

async function checkedFetch(url, fetchImpl, timeout = 30_000) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`Grok Build fetch failed: HTTP ${response.status} (${url})`);
  return response;
}

/** Resolve stable for this packaging step; never silently fall back to an old CLI. */
export async function refresh({ projectRoot = root, fetchImpl = fetch } = {}) {
  const noticesDir = join(projectRoot, "src-tauri/resources/grok-build");
  const manifestPath = join(noticesDir, "runtime.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const version = (await (await checkedFetch(`${artifactBase}/stable`, fetchImpl)).text()).trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid Grok Build stable version");
  if (version === manifest.version) {
    console.log(`Official stable Grok Build ${version} already pinned`);
    return manifest;
  }

  const source = await (await checkedFetch(`${sourceApi}/commits/main`, fetchImpl)).json();
  if (!/^[a-f0-9]{40}$/.test(source.sha)) throw new Error("Invalid Grok Build source revision");
  const tree = await (await checkedFetch(`${sourceApi}/git/trees/${source.sha}?recursive=1`, fetchImpl)).json();
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error("Incomplete Grok Build notice inventory");
  const notices = tree.tree.filter(({ type, path }) =>
    type === "blob" && !path.startsWith("/") && !path.split("/").includes("..") &&
    /^(?:licen[cs]e(?:[-.].*)?|notice(?:\.(?:md|txt))?|third[-_]party[-_]notices(?:\.(?:md|txt))?|.+[-_]license(?:\.txt)?)$/i.test(basename(path))
  ).map(({ path }) => ({ source: path, destination: noticeAliases[path] || path }));
  if (!["LICENSE", "THIRD-PARTY-NOTICES"].every(name => notices.some(n => n.destination === name))) {
    throw new Error("Required Grok Build license notices missing");
  }

  const binariesDir = join(projectRoot, "src-tauri/binaries");
  await mkdir(binariesDir, { recursive: true });
  const stage = await mkdtemp(join(binariesDir, ".refresh-"));
  try {
    // Finish every download before touching the prior manifest or staged release.
    const downloads = await Promise.allSettled([
      ...Object.entries(platforms).map(async ([target, platform]) => {
        const file = `grok-${version}-${platform}`;
        const response = await checkedFetch(`${artifactBase}/${file}`, fetchImpl, 900_000);
        if (!response.body) throw new Error(`Empty Grok Build artifact: ${file}`);
        const path = join(stage, file);
        await pipeline(Readable.fromWeb(response.body), createWriteStream(path, { flags: "wx" }));
        const hash = createHash("sha256");
        let size = 0;
        for await (const chunk of createReadStream(path)) { hash.update(chunk); size += chunk.length; }
        if (!size) throw new Error(`Empty Grok Build artifact: ${file}`);
        await chmod(path, 0o755);
        console.log(`Downloaded ${file} (${Math.round(size / 1024 / 1024)} MiB)`);
        return { target, file, sha256: hash.digest("hex") };
      }),
      ...notices.map(async notice => {
        const response = await checkedFetch(`https://raw.githubusercontent.com/xai-org/grok-build/${source.sha}/${notice.source}`, fetchImpl);
        const text = await response.text();
        if (!text.trim()) throw new Error(`Empty Grok Build notice: ${notice.source}`);
        const path = join(stage, "notices", notice.destination);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, text);
        return notice;
      }),
    ]);
    const failed = downloads.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
    const license = await readFile(join(stage, "notices/LICENSE"), "utf8");
    if (license !== await readFile(join(noticesDir, "LICENSE"), "utf8")) {
      throw new Error("Grok Build license changed; review the new license before updating the bundled runtime");
    }
    const artifacts = Object.fromEntries(downloads.slice(0, Object.keys(platforms).length).map(({ value }) =>
      [value.target, { file: value.file, sha256: value.sha256 }]
    ));
    const next = { ...manifest, version, noticesRevision: source.sha, artifacts };
    await writeFile(join(stage, "runtime.json"), `${JSON.stringify(next, null, 2)}\n`);
    for (const [target, artifact] of Object.entries(artifacts)) {
      const extension = target.includes("windows") ? ".exe" : "";
      await rename(join(stage, artifact.file), join(binariesDir, `grok-build-${target}${extension}`));
    }
    for (const notice of notices) {
      const destination = join(noticesDir, notice.destination);
      await mkdir(dirname(destination), { recursive: true });
      await rename(join(stage, "notices", notice.destination), destination);
    }
    await rename(join(stage, "runtime.json"), manifestPath);
    console.log(`Pinned official stable Grok Build ${version} with ${Object.keys(artifacts).length} platform hashes and ${notices.length} notices`);
    return next;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

export function resolveTarget(env = process.env, hostTriple) {
  // Tauri sets target architecture/platform for hooks, including cross compilation.
  const arch = env.TAURI_ENV_ARCH;
  const platform = env.TAURI_ENV_PLATFORM;
  if (arch && platform) {
    const suffix = { darwin: "apple-darwin", windows: "pc-windows-msvc", linux: "unknown-linux-gnu" }[platform];
    if (!suffix) throw new Error(`Unsupported bundled runtime platform: ${platform}`);
    return `${arch}-${suffix}`;
  }
  return hostTriple || execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/^host: (.+)$/m)?.[1];
}

export async function verifyArtifact(path, expectedSha256) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest("hex") !== expectedSha256) throw new Error(`Runtime checksum mismatch: ${path}`);
}

export async function prepare(target) {
  const manifest = JSON.parse(await readFile(join(root, "src-tauri/resources/grok-build/runtime.json"), "utf8"));
  const artifact = manifest.artifacts[target];
  if (!artifact) throw new Error(`No pinned Grok Build runtime for ${target}`);
  const extension = target.includes("windows") ? ".exe" : "";
  const destination = join(root, "src-tauri/binaries", `grok-build-${target}${extension}`);
  await mkdir(dirname(destination), { recursive: true });
  try {
    await verifyArtifact(destination, artifact.sha256);
    await chmod(destination, 0o755);
    console.log(`Bundled Grok Build ${manifest.version} ready (${target})`);
    return destination;
  } catch (error) {
    if (error.code !== "ENOENT") throw error; // A modified cached binary must not silently ship.
  }
  const temporary = `${destination}.${process.pid}.part`;
  try {
    const response = await fetch(`${artifactBase}/${artifact.file}`, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok || !response.body) throw new Error(`Runtime download failed: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: "wx" }));
    await verifyArtifact(temporary, artifact.sha256);
    await chmod(temporary, 0o755);
    await rename(temporary, destination);
    console.log(`Bundled Grok Build ${manifest.version} prepared (${target})`);
    return destination;
  } finally {
    await rm(temporary, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { target: { type: "string" }, refresh: { type: "boolean", default: false } } });
  if (values.refresh) await refresh();
  await prepare(values.target || resolveTarget());
}
