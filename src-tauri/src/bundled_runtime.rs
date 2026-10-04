//! The desktop owns its runtime; never discover or update a terminal installation.
use std::path::{Path, PathBuf};

pub const MANAGED_UPDATE_ERROR: &str =
    "BUNDLED_RUNTIME: Update or reinstall Grok App to replace its bundled Grok Build runtime.";

/// Tauri externalBin lives beside the application executable on every platform.
fn packaged_path(app_exe: &Path) -> PathBuf {
    app_exe.with_file_name(if cfg!(windows) {
        "grok-build.exe"
    } else {
        "grok-build"
    })
}

pub fn path() -> PathBuf {
    if cfg!(debug_assertions) || cfg!(test) {
        let suffix = if cfg!(windows) { ".exe" } else { "" };
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!(
                "grok-build-{}{suffix}",
                env!("GROK_BUNDLED_TARGET")
            ))
    } else {
        // Fail closed if the package is incomplete, even when external grok exists.
        std::env::current_exe()
            .map(|exe| packaged_path(&exe))
            .unwrap_or_default()
    }
}

pub fn reject_separate_update() -> Result<(), String> {
    Err(MANAGED_UPDATE_ERROR.into())
}

/// The official updater treats an unknown explicit installer as externally managed.
/// Scope this to our executable, never to a user's terminal / unrelated child process.
pub fn configure_std(cmd: &mut std::process::Command) {
    if Path::new(cmd.get_program()) == path() {
        cmd.env("GROK_INSTALLER", "grok-app");
    }
}

pub fn configure_tokio(cmd: &mut tokio::process::Command) {
    if Path::new(cmd.as_std().get_program()) == path() {
        cmd.env("GROK_INSTALLER", "grok-app");
    }
}

/// Windows cannot overwrite a running executable. Include headless jobs and
/// App-started leader/serve children not owned by the ACP session manager.
/// Match the full executable path so terminal CLI installations remain untouched.
#[cfg(windows)]
pub async fn stop_windows_processes() -> Result<(), String> {
    stop_windows_executable(&path()).await
}

#[cfg(windows)]
async fn stop_windows_executable(runtime: &Path) -> Result<(), String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$runtime = [IO.Path]::GetFullPath($env:GROK_APP_BUNDLED_RUNTIME)
Get-CimInstance Win32_Process -Filter "Name = 'grok-build.exe'" | Where-Object {
    $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath) -eq $runtime
} | ForEach-Object {
    & "$env:SystemRoot\System32\taskkill.exe" /PID $_.ProcessId /T /F | Out-Null
}
$remaining = @(Get-CimInstance Win32_Process -Filter "Name = 'grok-build.exe'" | Where-Object {
    $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath) -eq $runtime
})
if ($remaining.Count -gt 0) { throw 'Bundled runtime is still running' }
"#;
    let mut cmd = crate::process_util::tokio_command("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", script])
        .env("GROK_APP_BUNDLED_RUNTIME", runtime)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let output = tokio::time::timeout(std::time::Duration::from_secs(15), cmd.output())
        .await
        .map_err(|_| "Timed out stopping bundled runtime before update".to_string())?
        .map_err(|e| format!("Could not stop bundled runtime: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "Could not stop bundled runtime: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_moves_with_the_application() {
        let exe = Path::new("/relocated/Grok.app/Contents/MacOS/grok-app");
        assert_eq!(packaged_path(exe).parent(), exe.parent());
        assert_ne!(packaged_path(exe), exe);
    }

    #[test]
    fn external_commands_keep_their_environment() {
        let mut bundled = std::process::Command::new(path());
        configure_std(&mut bundled);
        assert!(bundled
            .get_envs()
            .any(|(key, value)| key == "GROK_INSTALLER"
                && value == Some(std::ffi::OsStr::new("grok-app"))));
        let mut external = std::process::Command::new("grok");
        configure_std(&mut external);
        assert!(!external.get_envs().any(|(key, _)| key == "GROK_INSTALLER"));
        assert!(reject_separate_update().is_err());
    }
    #[test]
    fn legacy_actions_cannot_modify_terminal_installations() {
        assert!(crate::cli_update::check_cli_update(Some("/external/grok"))
            .unwrap_err()
            .contains("BUNDLED_RUNTIME"));
        assert!(
            crate::cli_probe::repair_agent_sidecar_link(Some("/external/grok"))
                .unwrap_err()
                .contains("BUNDLED_RUNTIME")
        );
        let settings = crate::store::AppSettings {
            cli_backend: "wsl".into(),
            manual_cli_path: Some("/external/grok".into()),
            ..Default::default()
        };
        assert!(!crate::wsl_backend::wsl_backend_active(&settings));
        assert!(crate::wsl_backend::resolve_wsl_launch(&settings).is_none());
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn windows_update_stops_only_its_own_runtime_path() {
        let root = std::env::temp_dir().join(format!("grok-update-{}", uuid::Uuid::new_v4()));
        let own = root.join("app");
        let other = root.join("other");
        std::fs::create_dir_all(&own).unwrap();
        std::fs::create_dir_all(&other).unwrap();
        let ping = PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join("System32/ping.exe");
        let own_exe = own.join("grok-build.exe");
        let other_exe = other.join("grok-build.exe");
        std::fs::copy(&ping, &own_exe).unwrap();
        std::fs::copy(&ping, &other_exe).unwrap();
        let spawn = |exe: &Path| {
            let mut cmd = crate::process_util::tokio_command(exe);
            cmd.args(["-t", "127.0.0.1"])
                .stdout(std::process::Stdio::null())
                .kill_on_drop(true);
            cmd.spawn().unwrap()
        };
        let mut owned = spawn(&own_exe);
        let mut external = spawn(&other_exe);
        stop_windows_executable(&own_exe).await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(3), owned.wait())
            .await
            .unwrap()
            .unwrap();
        assert!(
            external.try_wait().unwrap().is_none(),
            "another installation must survive"
        );
        external.kill().await.unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }
}
