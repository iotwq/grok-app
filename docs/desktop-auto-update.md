# Desktop auto-update

Grok App uses the same **Tauri 2 updater** shape as Minos / Buzz: signed release
artifacts, a rolling `latest.json` endpoint, in-app check/download/install, and
a platform-specific stop of managed agent / mirror / voice / IM processes during installation and restart.

## Bundled runtime update (2026-09-20)

App updates include the pinned Grok Build executable and its license notices.
Terminal CLI installations are independent; no separate CLI update prompt is shown.
macOS/Linux keep install → stop services → relaunch. On Windows, stop services and
release all processes using this App's exact bundled executable path **before**
`install()`, because Tauri starts NSIS/MSI and exits without returning to JavaScript.
If stopping or installation fails after teardown begins, About requires restarting
the existing App to restore services before retrying. The frontend does not claim it
can observe installer failure/cancellation after the Windows process has exited.
See [bundled runtime](llm-wiki/bundled-runtime.md) for validation and distribution.

## Architecture

```
CI release
  ├── vX.Y.Z                 user-facing installers (DMG / AppImage / NSIS …)
  └── grok-desktop-latest    rolling updater release
        └── latest.json  + per-platform archive + .sig
                 ▲
                 │ check()
        Desktop  tauri-plugin-updater  (release builds only)
                 │ install + service teardown (platform order below)
                 │ relaunch / installer handoff
        UI: Settings → About
```

Local builds have no update source by default. Manual updates require both build-time
`GROK_APP_RELEASES_URL` (HTTPS release API) and `GROK_APP_RELEASES_HTML_URL`
(HTTPS release page). These are embedded in the binary; runtime shell variables
and frontend-only overrides do not select a different distributor. Release CI
sets both from its own `github.repository`. There is no upstream fallback.

## App pieces

| Piece | Location |
|-------|----------|
| Build-time gate | `build.rs` → `cfg(grok_updater_enabled)` when both `GROK_UPDATER_*` env vars are set (crate always linked for ACL) |
| Release conf delta | `scripts/build-release-config.mjs` → `src-tauri/tauri.release.conf.json` (gitignored — always regenerate) |
| Plugin register | `src-tauri/src/lib.rs` (cfg + non-debug only) |
| Platform support | `is_auto_update_supported` — Linux requires AppImage (`APPIMAGE` env) |
| Pre-relaunch teardown | `prepare_for_app_update` — after install on macOS/Linux; before installer handoff on Windows |
| Frontend state machine | `src/hooks/useUpdater.ts` + `UpdaterProvider` (single path: plugin or GitHub) |
| Path honesty (copy / channel) | `src/lib/appUpdateHonesty.ts` — signed auto vs GitHub manual vs unsupported vs host-only; soft-fail error classes; platform-specific service teardown boundary |
| UI | Settings → About (`AboutUpdateRow`) |
| Capabilities | `updater:allow-*`, `process:allow-restart` |

Local `pnpm dev` / debug builds **never** enable the updater plugin (no
feature, no env), so dev binaries never hit a production endpoint.

### Install / teardown order (P0)

```
macOS/Linux: download → install() → prepare_for_app_update() → relaunch()
Windows: download → prepare_for_app_update() → install() → installer owns exit/relaunch
```

If `install()` fails on macOS/Linux, agents / voice / IM / mirror stay running.
On Windows, restart the existing App to restore services before another attempt.

## Secrets (GitHub Actions)

| Secret / variable | Purpose |
|-------------------|---------|
| `GROK_UPDATER_PUBLIC_KEY` | minisign public key embedded in the app |
| `TAURI_SIGNING_PRIVATE_KEY` | minisign private key for signing updater archives |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | password for the private key (empty string OK) |
| Apple signing / notarize secrets | codesign + notarize DMG / .app (recommended for macOS Gatekeeper) |

Generate a keypair once (see [Tauri updater](https://v2.tauri.app/plugin/updater/)):

```sh
pnpm tauri signer generate -w ~/.tauri/grok-app.key
# public key → GROK_UPDATER_PUBLIC_KEY
# private key file contents → TAURI_SIGNING_PRIVATE_KEY
```

### Maintainer production checklist

Before treating silent update as “on” for users:

1. **Secrets in the shipping repo** (Settings → Secrets and variables → Actions): all four rows above that you use. Empty `TAURI_SIGNING_PRIVATE_KEY` must not be set — omit or set a real key.
2. **Local dry-run (no secret values printed):**
   ```sh
   ./scripts/verify-updater-setup.sh
   ./scripts/verify-updater-setup.sh --fetch-latest
   ```
3. **Release cut:** tag `vX.Y.Z` so CI builds installers **and** refreshes `grok-desktop-latest` + `latest.json` + `.sig`.
4. **Smoke on a prior signed build:** Settings → About shows **Update channel: in-app (signed release)** → Check → Download → Install and restart → version matches tag.
5. **Failure path:** on macOS/Linux, installation failure must keep agents / Remote IM / mirror running. On Windows, preparation failure must prevent installer launch; a handoff failure after teardown must offer restarting the current App and block another update attempt until restart.
6. **Unsigned / local builds:** with no source configured, About explains that updates must come from the distributor and does not offer checks or downloads. With an explicit source, verify that manual downloads stay within that distribution.
7. **Linux non-AppImage:** About shows **unsupported** package-type channel + AppImage-only note when the plugin is compiled in.

In-app host command `updater_status` reports `{ channel, pluginEnabled, platformSupported, endpoint }` for Doctor / About (`channel` is `silent` | `github_manual` | `unsupported`).

## Rolling endpoint

```text
https://github.com/<owner>/grok-app/releases/download/grok-desktop-latest/latest.json
```

Publish two GitHub releases per cut:

1. **`vX.Y.Z`** — human installers + notes + **stable aliases** (`Grok_mac_x64.dmg`, `Grok_windows_x64-setup.exe`, …) + `downloads.json` for grok-app.com
2. **`grok-desktop-latest`** — updater archives + `latest.json` (clobber each release)

Do **not** point website download buttons at `grok-desktop-latest`. That tag is the silent updater channel. First-time installs use `/releases/latest/download/<stable-alias>` (see `docs/llm-wiki/release.md`).

## Build steps (outline)

```sh
export GROK_UPDATER_PUBLIC_KEY=...
export GROK_UPDATER_ENDPOINT=https://github.com/<owner>/grok-app/releases/download/grok-desktop-latest/latest.json
export TAURI_SIGNING_PRIVATE_KEY=...
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=...

# 1) Write tauri.release.conf.json (gitignored — required before --config)
node scripts/build-release-config.mjs

# 2) Same GROK_UPDATER_* env must still be set so build.rs enables registration
pnpm tauri build --config src-tauri/tauri.release.conf.json
```

Without step 1, `tauri build --config src-tauri/tauri.release.conf.json` fails with
file not found. The crate is always a hard dependency (Tauri ACL); only
**registration** is gated by the env cfg.

After all platforms upload assets to `vX.Y.Z`:

```sh
TAG=v0.1.9 REPO=<owner>/grok-app bash scripts/assemble-updater-manifest.sh
```

Platform keys: `darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`, `windows-x86_64`.

## Linux note

Only **AppImage** supports in-app update. `.deb` / `.rpm` installs report
channel **`unsupported`** (About: package-type cannot auto-update + AppImage
note) and surface `manual-required` when a newer build is known so the user can
open GitHub Releases.

## macOS note

Codesign + notarize the `.app` / DMG in CI when Apple secrets are present.
After notarization, rebuild the updater `.tar.gz` from the signed app and
re-sign with the Tauri updater key (same pattern as Buzz) if you notarize
post-build.

## Manual verification

1. `pnpm typecheck` / `pnpm test` — UI unit tests
2. `cargo test --manifest-path src-tauri/Cargo.toml updater::` — Rust helpers
3. Settings → About shows **manual GitHub check** on local builds (expected)
4. Release smoke: build with both env vars, confirm `is_updater_plugin_enabled`
   is true in a release binary, and that check hits `latest.json`

## Compatible manual installers (2026-10-04)

Manual asset selection first requires a matching OS format and CPU architecture,
then ranks compatible files. macOS uses DMG (including explicitly universal DMGs),
Windows EXE/MSI, and Linux AppImage/DEB/RPM. Architecture tokens must identify
ARM64/aarch64 or x64/x86_64/amd64; an unknown architecture is not assumed compatible.
Missing matches leave the download URL empty and About explains that no matching
installer was found. It never substitutes another OS or CPU's asset.
