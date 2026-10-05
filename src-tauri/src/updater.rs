//! Desktop auto-update helpers (Tauri updater plugin + process relaunch).
//!
//! Runtime registration only when release CI injects `GROK_UPDATER_PUBLIC_KEY` +
//! `GROK_UPDATER_ENDPOINT` (`build.rs` → `cfg(grok_updater_enabled)`) on a
//! non-debug binary. The crate itself is always a hard dependency so Tauri ACL
//! can resolve `updater:allow-*` permissions at build time.
//!
//! Local / unsigned builds keep the manual GitHub path via the frontend state
//! machine (`app_check_update`).
//!
//! ## Teardown ordering (P0)
//!
//! Linux calls prepare after successful install and before relaunch.
//! Windows calls it before install: the updater exits immediately after starting
//! NSIS/MSI, and a running bundled .exe would block replacement. On a failed
//! Windows handoff the UI requires restarting the existing App to restore services.
//! macOS uses the GitHub DMG manual-download path and does not enter this flow.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, State};
use tracing::info;

use crate::mirror::MirrorHost;
use crate::remote_im::RemoteImState;
use crate::session_manager::SessionManager;
use crate::voice_host::VoiceHost;

/// Process-wide guard so prepare-for-update does not race with itself.
///
/// Set when confirmed installation reaches teardown. A Windows handoff failure
/// requires an App restart; another install must not reuse this guard in-process.
static UPDATE_SHUTDOWN_DONE: AtomicBool = AtomicBool::new(false);

pub fn shutdown_started() -> bool {
    UPDATE_SHUTDOWN_DONE.load(Ordering::SeqCst)
}

/// Returns `true` when the running install supports Tauri's auto-updater.
///
/// On Linux, Tauri's updater only works for AppImage bundles. The AppImage
/// runtime sets `APPIMAGE` when the binary is executed from an AppImage.
/// `.deb` / `.rpm` packages surface a manual-download path instead.
///
/// macOS uses the manual DMG path until signed/notarized updater archives are
/// available. Windows keeps the in-app installer handoff; Linux remains
/// AppImage-only.
#[tauri::command]
pub fn is_auto_update_supported() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var("APPIMAGE").is_ok()
    }
    #[cfg(target_os = "macos")]
    {
        false
    }
    #[cfg(target_os = "windows")]
    {
        true
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        false
    }
}

/// True when this binary was built with pubkey + endpoint injected
/// (`GROK_UPDATER_*` at compile time) and is not a debug build.
#[tauri::command]
pub fn is_updater_plugin_enabled() -> bool {
    cfg!(grok_updater_enabled) && !cfg!(debug_assertions) && !cfg!(target_os = "macos")
}

/// Snapshot for About / Doctor: which update path this binary can use.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterStatusDto {
    /// Platform packaging supports silent install (Windows or Linux AppImage).
    pub platform_supported: bool,
    /// Release binary built with signing pubkey + endpoint.
    pub plugin_enabled: bool,
    /// `silent` when plugin path is live; `unsupported` when plugin is on but
    /// the package type cannot auto-update (e.g. Linux non-AppImage);
    /// otherwise `github_manual` (unsigned / local / plugin off).
    pub channel: String,
    /// Compile-time endpoint (empty when plugin off).
    pub endpoint: String,
    pub manual_configured: bool,
    pub release_url: String,
}

#[tauri::command]
pub fn updater_status() -> UpdaterStatusDto {
    let platform_supported = is_auto_update_supported();
    let plugin_enabled = is_updater_plugin_enabled();
    let channel = if plugin_enabled && platform_supported {
        "silent".to_string()
    } else if plugin_enabled && !platform_supported {
        // Signed binary but this install type cannot silent-update.
        "unsupported".to_string()
    } else {
        "github_manual".to_string()
    };
    // Endpoint is only meaningful when the plugin was compiled in; avoid leaking
    // build-time env into debug strings beyond the non-secret public URL.
    let endpoint = if plugin_enabled {
        option_env!("GROK_UPDATER_ENDPOINT")
            .unwrap_or("")
            .to_string()
    } else {
        String::new()
    };
    UpdaterStatusDto {
        platform_supported,
        plugin_enabled,
        channel,
        endpoint,
        manual_configured: crate::app_update::release_urls().is_some(),
        release_url: crate::app_update::release_urls()
            .map(|(_, page)| page)
            .unwrap_or("")
            .to_string(),
    }
}

/// Stop managed agent children / hosts before process relaunch after a staged install.
///
/// After install on Linux; before the exiting installer on Windows.
/// See module documentation for Windows failure recovery.
///
/// `remote_im.inner` is held only for the duration of `stop_async`. That method
/// uses a separate global `runtime_slot` mutex (not `remote_im.inner`) and
/// parking_lot fields on `BridgeRuntime` — audited: no re-lock of `inner`.
#[tauri::command]
pub async fn prepare_for_app_update(
    app: AppHandle,
    mgr: State<'_, Arc<SessionManager>>,
    mirror: State<'_, Arc<MirrorHost>>,
    voice: State<'_, Arc<VoiceHost>>,
    remote_im: State<'_, Arc<RemoteImState>>,
) -> Result<(), String> {
    if UPDATE_SHUTDOWN_DONE.swap(true, Ordering::SeqCst) {
        info!(target: "grok_app::updater", "prepare_for_app_update already completed");
        return Ok(());
    }

    info!(target: "grok_app::updater", "stopping managed processes before app relaunch");

    // Voice realtime session first (network + tool delegation).
    // Pass SessionManager so keep_agents_on_end=false can cancel delegated turns.
    let _ = voice.stop(&app, mgr.inner()).await;

    // Remote IM connectors (Feishu / Weixin / …).
    // Hold `inner` only while stop_async runs; stop_async does not re-enter `inner`.
    {
        let mut rt = remote_im.inner.lock().await;
        if let Err(e) = rt.stop_async().await {
            tracing::warn!(target: "grok_app::updater", error = %e, "remote_im stop during prepare_for_app_update");
        }
    }

    // Kill live + background ACP agent processes; session metadata stays on disk.
    mgr.recycle_all_agents(&app, "app_update").await;

    // Mirror HTTP host + cloudflared tunnel.
    mirror.stop_sync();

    #[cfg(windows)]
    crate::bundled_runtime::stop_windows_processes().await?;

    info!(target: "grok_app::updater", "managed processes stopped; safe to relaunch");
    Ok(())
}

/// Reset guard — only for tests.
#[cfg(test)]
pub fn reset_update_shutdown_guard_for_tests() {
    UPDATE_SHUTDOWN_DONE.store(false, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_update_supported_is_bool() {
        let _ = is_auto_update_supported();
        assert!(!is_updater_plugin_enabled() || cfg!(grok_updater_enabled));
    }

    #[test]
    fn updater_status_channel_matches_flags() {
        let s = updater_status();
        assert!(
            s.channel == "silent" || s.channel == "github_manual" || s.channel == "unsupported"
        );
        if s.plugin_enabled && s.platform_supported {
            assert_eq!(s.channel, "silent");
        } else if s.plugin_enabled && !s.platform_supported {
            assert_eq!(s.channel, "unsupported");
        } else {
            assert_eq!(s.channel, "github_manual");
        }
    }

    #[test]
    fn plugin_enabled_false_in_debug_without_cfg() {
        if cfg!(debug_assertions) {
            assert!(!is_updater_plugin_enabled());
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_uses_manual_update_path() {
        assert!(!is_auto_update_supported());
        assert!(!is_updater_plugin_enabled());
        assert_eq!(updater_status().channel, "github_manual");
    }

    #[test]
    fn shutdown_guard_is_idempotent_flag() {
        reset_update_shutdown_guard_for_tests();
        assert!(!UPDATE_SHUTDOWN_DONE.load(Ordering::SeqCst));
        UPDATE_SHUTDOWN_DONE.store(true, Ordering::SeqCst);
        assert!(UPDATE_SHUTDOWN_DONE.load(Ordering::SeqCst));
        reset_update_shutdown_guard_for_tests();
    }
}
