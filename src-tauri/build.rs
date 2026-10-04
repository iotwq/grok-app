fn main() {
    // A release binary without Tauri's custom protocol still loads devUrl.
    // Bundling that binary succeeds but leaves installed apps with a blank page.
    if std::env::var("PROFILE").as_deref() == Ok("release") && tauri_build::is_dev() {
        panic!(
            "Release builds must embed the frontend: use `pnpm exec tauri build` \
             (or enable `--features tauri/custom-protocol` for a manual Cargo build)."
        );
    }

    // Windows test STATUS_ENTRYPOINT_NOT_FOUND fix lives in CI (post-link mt.exe
    // Common Controls v6 on the test harness). Do NOT add /MANIFESTINPUT here:
    // tauri_build already embeds a Windows app manifest; a second one fails
    // link with CVT1100 "duplicate resource" (v0.1.9 release).

    for name in ["GROK_APP_RELEASES_URL", "GROK_APP_RELEASES_HTML_URL"] {
        println!("cargo:rerun-if-env-changed={name}");
        if let Ok(value) = std::env::var(name) {
            println!("cargo:rustc-env={name}={}", value.trim());
        }
    }

    println!("cargo:rerun-if-env-changed=GROK_UPDATER_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=GROK_UPDATER_ENDPOINT");
    println!("cargo:rustc-check-cfg=cfg(grok_updater_enabled)");

    // Release CI injects both env vars so registration is allowed at runtime.
    // Local `tauri dev` leaves env unset → plugin crate is linked for ACL only,
    // never registered.
    let updater_public_key = std::env::var("GROK_UPDATER_PUBLIC_KEY")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let updater_endpoint = std::env::var("GROK_UPDATER_ENDPOINT")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if let (Some(_key), Some(endpoint)) = (updater_public_key, updater_endpoint) {
        println!("cargo:rustc-cfg=grok_updater_enabled");
        // Expose non-secret endpoint URL to `option_env!` / status DTO.
        println!("cargo:rustc-env=GROK_UPDATER_ENDPOINT={endpoint}");
    }

    println!(
        "cargo:rustc-env=GROK_BUNDLED_TARGET={}",
        std::env::var("TARGET").unwrap()
    );

    tauri_build::build()
}
