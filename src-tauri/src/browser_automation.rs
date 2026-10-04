//! Browser actions over the existing authenticated loopback transport.
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Listener, Manager};

#[cfg(target_os = "linux")]
use crate::browser_linux as platform;
#[cfg(target_os = "macos")]
use crate::browser_webkit as platform;
#[cfg(target_os = "windows")]
use crate::browser_windows as platform;

#[cfg(not(target_os = "linux"))]
const PAGE_SCRIPT: &str = include_str!("browser_automation.js");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrowserRequest {
    pub tab_id: String,
    pub action: String,
    #[serde(default)]
    pub project_path: String,
    #[serde(default)]
    pub args: Value,
}

fn label_for(tab_id: &str) -> Result<String, String> {
    let id = tab_id
        .strip_prefix("agent-")
        .ok_or("Invalid agent browser tab")?;
    uuid::Uuid::parse_str(id).map_err(|_| "Invalid agent browser tab")?;
    Ok(format!("resource-browser-{tab_id}"))
}

fn navigation_url(args: &Value) -> Result<String, String> {
    let raw = args
        .get("url")
        .and_then(Value::as_str)
        .ok_or("url is required")?;
    let url = reqwest::Url::parse(raw).map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("Browser automation only allows HTTP(S) pages".into());
    }
    Ok(url.to_string())
}

fn decode_eval(raw: &str) -> Result<Value, String> {
    let mut value: Value =
        serde_json::from_str(raw).map_err(|e| format!("Invalid browser result: {e}"))?;
    // WKWebView and WebView2 can differ in how a JS string result is wrapped.
    if let Some(text) = value.as_str() {
        value = serde_json::from_str(text).map_err(|e| format!("Invalid browser result: {e}"))?;
    }
    if value.is_null() {
        return Err("Page navigated during the action. Inspect it before retrying.".into());
    }
    Ok(value)
}

/// Visible browsing is tied to its originating workspace, never the foreground
/// project's tab group. Inactive projects must be brought back before browsing.
fn require_active_project(app: &AppHandle, project_path: &str) -> Result<(), String> {
    let request_id = uuid::Uuid::new_v4().to_string();
    let expected = request_id.clone();
    let (tx, rx) = mpsc::channel();
    let listener = app.listen("browser-agent://project-result", move |event| {
        if let Ok(value) = serde_json::from_str::<Value>(event.payload()) {
            if value["requestId"] == expected {
                let _ = tx.send(value["active"] == true);
            }
        }
    });
    let result = (|| {
        app.emit_to(tauri::EventTarget::webview("main"), "browser-agent://check-project",
            json!({"requestId":request_id,"projectPath":project_path}))
            .map_err(|e| e.to_string())?;
        match rx.recv_timeout(Duration::from_secs(3)) {
            Ok(true) => Ok(()),
            Ok(false) => Err("This browser belongs to another project. Ask the user to return to that project before continuing; do not open it in the current project.".into()),
            Err(_) => Err("Browser workspace is unavailable. Return to the main workbench before continuing.".into()),
        }
    })();
    app.unlisten(listener);
    result
}

/// Called on a blocking worker: WebView callbacks need the main UI runloop.
pub fn execute(app: &AppHandle, request: BrowserRequest) -> Result<Value, String> {
    let label = label_for(&request.tab_id)?;
    if !crate::browser_mcp::tools()
        .as_array()
        .unwrap()
        .iter()
        .any(|t| t["name"] == request.action)
    {
        return Err("Unknown browser action".into());
    }
    require_active_project(app, &request.project_path)?;
    if request.action == "browser_close" {
        app.emit_to(
            tauri::EventTarget::webview("main"),
            "browser-agent://tab",
            json!({"tabId":request.tab_id,"action":"close","projectPath":request.project_path}),
        )
        .map_err(|e| e.to_string())?;
        // Let the mounted component finish its close lifecycle before a caller
        // can reopen the same tab ID; closing only the native view races React.
        let deadline = Instant::now() + Duration::from_secs(5);
        while app.get_webview(&label).is_some() {
            if Instant::now() >= deadline {
                return Err(
                    "Browser tab did not close. Close it in the workbench and retry.".into(),
                );
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        return Ok(json!({"ok":true}));
    }
    if request.action == "browser_open" {
        let url = navigation_url(&request.args)?;
        let (tx, rx) = mpsc::channel();
        let target = label.clone();
        let listener = app.listen("side-browser://page-load", move |event| {
            if let Ok(value) = serde_json::from_str::<Value>(event.payload()) {
                if value["label"] == target && value["phase"] == "finished" {
                    let _ = tx.send(());
                }
            }
        });
        let result = (|| {
            app.emit_to(
                tauri::EventTarget::webview("main"),
                "browser-agent://tab",
                json!({"tabId":request.tab_id,"action":"open","url":url,"projectPath":request.project_path}),
            )
            .map_err(|e| e.to_string())?;
            let deadline = Instant::now() + Duration::from_secs(15);
            while app.get_webview(&label).is_none() {
                if Instant::now() >= deadline {
                    return Err(
                        "Browser tab did not open. Open the Grok App workbench and retry.".into(),
                    );
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            platform::install(app, &label)?;
            // The first load can precede installation of the native frame observer.
            // Navigate after installing so every frame is registered in the isolated world.
            {
                while rx.try_recv().is_ok() {}
                crate::side_browser_host::navigate(app, label.clone(), url.clone())?;
            }
            rx.recv_timeout(Duration::from_secs(15))
                .map_err(|_| "Page load did not finish. Use browser_snapshot to inspect; do not assume navigation succeeded.".to_string())?;
            Ok(
                json!({"ok":true,"url":crate::side_browser_host::current_url(app, label.clone())?,"next":"Use browser_snapshot to read the page."}),
            )
        })();
        app.unlisten(listener);
        return result;
    }
    let url = crate::side_browser_host::current_url(app, label.clone())
        .map_err(|_| "Browser tab is closed. Call browser_open first.".to_string())?;
    navigation_url(&json!({"url":url}))?;
    if request.action == "browser_screenshot" {
        return screenshot(app, &label);
    }
    if request.action == "browser_frames" {
        return platform::frames(app, &label);
    }
    let frame = frame_argument(&request.args)?;
    #[cfg(target_os = "linux")]
    {
        decode_eval(&platform::execute(
            app,
            &label,
            frame,
            request.action,
            request.args.clone(),
        )?)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let action = serde_json::to_string(&request.action).map_err(|e| e.to_string())?;
        let args = serde_json::to_string(&request.args).map_err(|e| e.to_string())?;
        let script = format!("({PAGE_SCRIPT})({action},{args})");
        decode_eval(&platform::evaluate(app, &label, frame, script)?)
    }
}

fn frame_argument(args: &Value) -> Result<Option<&str>, String> {
    match args.get("frame") {
        None => Ok(None),
        Some(Value::String(id)) if uuid::Uuid::parse_str(id).is_ok() => Ok(Some(id)),
        _ => Err("frame must be a document ID returned by browser_frames".into()),
    }
}

fn screenshot(app: &AppHandle, label: &str) -> Result<Value, String> {
    use base64::Engine;
    let bytes = platform::screenshot(app, label)?;
    let image = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let image = if image.width() > 1600 || image.height() > 1600 {
        image.thumbnail(1600, 1600)
    } else {
        image
    };
    let mut png = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let dir = crate::paths::app_data_root()
        .join("attachments")
        .join("browser");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.png", uuid::Uuid::new_v4()));
    std::fs::write(&path, png.get_ref()).map_err(|e| e.to_string())?;
    Ok(
        json!({"path":path,"mimeType":"image/png","width":image.width(),"height":image.height(),
        "data":base64::engine::general_purpose::STANDARD.encode(png.get_ref())}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restrict_navigation_and_tab_targets() {
        for url in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,a",
            "tauri://localhost",
        ] {
            assert!(navigation_url(&json!({"url":url})).is_err());
        }
        assert!(navigation_url(&json!({"url":"http://localhost:3000"})).is_ok());
        assert!(navigation_url(&json!({"url":"https://example.com"})).is_ok());
        assert!(label_for("main").is_err());
        assert!(label_for("agent-../../main").is_err());
        assert!(label_for(&format!("agent-{}", uuid::Uuid::new_v4())).is_ok());
    }
    #[test]
    fn decode_platform_results() {
        assert_eq!(decode_eval(r#"{"ok":true}"#).unwrap()["ok"], true);
        assert_eq!(decode_eval(r#""{\"ok\":true}""#).unwrap()["ok"], true);
        assert!(decode_eval("null").is_err());
    }

    #[test]
    fn frame_ids_must_come_from_native_discovery() {
        assert_eq!(frame_argument(&json!({})).unwrap(), None);
        let id = uuid::Uuid::new_v4().to_string();
        let args = json!({"frame":id});
        assert_eq!(frame_argument(&args).unwrap(), Some(id.as_str()));
        for frame in [json!(null), json!(2), json!("main"), json!("';alert(1)//")] {
            assert!(frame_argument(&json!({"frame":frame})).is_err());
        }
    }
}
