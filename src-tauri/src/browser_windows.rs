//! WebView2 native frame handles (including nested frames), and viewport capture.
//! COM objects live only on the UI thread. There is no remote debugging listener.
use base64::Engine;
use serde_json::{json, Value};
use std::{cell::RefCell, collections::HashMap, sync::mpsc, time::Duration};
use tauri::AppHandle;
use webview2_com::{
    CallDevToolsProtocolMethodCompletedHandler, ExecuteScriptCompletedHandler,
    FrameChildFrameCreatedEventHandler, FrameCreatedEventHandler, FrameDestroyedEventHandler,
    Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2Frame, ICoreWebView2Frame2, ICoreWebView2Frame7,
        ICoreWebView2_4,
    },
};
use windows::core::{Interface, HSTRING};

#[derive(Default)]
struct Tab {
    handles: HashMap<String, ICoreWebView2Frame>,
    documents: HashMap<String, Option<String>>,
    error: Option<String>,
}
thread_local! {
    static TABS: RefCell<HashMap<String, Tab>> = RefCell::new(HashMap::new());
}

fn observe(label: &str, frame: ICoreWebView2Frame) -> windows::core::Result<()> {
    let key = uuid::Uuid::new_v4().to_string();
    let inserted = TABS.with(|tabs| {
        let mut tabs = tabs.borrow_mut();
        let Some(tab) = tabs.get_mut(label) else {
            return false;
        };
        if tab.handles.len() >= 128 {
            return false;
        }
        tab.handles.insert(key.clone(), frame.clone());
        true
    });
    if !inserted {
        return Ok(());
    }
    // Frame7 is required for nested frames; never silently claim partial discovery.
    let nested = frame.cast::<ICoreWebView2Frame7>()?;
    let nested_label = label.to_string();
    let handler = FrameChildFrameCreatedEventHandler::create(Box::new(move |_, args| {
        if let Some(args) = args {
            register_frame(&nested_label, unsafe { args.Frame()? });
        }
        Ok(())
    }));
    let gone_label = label.to_string();
    let gone = FrameDestroyedEventHandler::create(Box::new(move |_, _| {
        TABS.with(|tabs| {
            if let Some(tab) = tabs.borrow_mut().get_mut(&gone_label) {
                tab.handles.remove(&key);
                tab.documents
                    .retain(|_, target| target.as_ref() != Some(&key));
            }
        });
        Ok(())
    }));
    unsafe {
        nested.add_FrameCreated(&handler, &mut 0)?;
        frame.add_Destroyed(&gone, &mut 0)?;
    }
    Ok(())
}
fn register_frame(label: &str, frame: ICoreWebView2Frame) {
    if let Err(error) = observe(label, frame) {
        TABS.with(|tabs| {
            if let Some(tab) = tabs.borrow_mut().get_mut(label) {
                tab.error = Some(format!(
                    "Update Microsoft Edge WebView2 Runtime for nested frame automation: {error}"
                ));
            }
        });
    }
}

pub fn install(app: &AppHandle, label: &str) -> Result<(), String> {
    let view = crate::side_browser_host::get_side_webview(app, label)?;
    let label = label.to_string();
    let (tx, rx) = mpsc::channel();
    view.with_webview(move |native| {
        let result = (|| unsafe {
            if TABS.with(|tabs| tabs.borrow().contains_key(&label)) {
                return Ok(());
            }
            let webview = native.controller().CoreWebView2()?;
            let frames = webview.cast::<ICoreWebView2_4>()?;
            let observed_label = label.clone();
            let handler = FrameCreatedEventHandler::create(Box::new(move |_, args| {
                if let Some(args) = args {
                    register_frame(&observed_label, args.Frame()?);
                }
                Ok(())
            }));
            frames.add_FrameCreated(&handler, &mut 0)?;
            TABS.with(|tabs| tabs.borrow_mut().insert(label, Tab::default()));
            Ok::<_, windows::core::Error>(())
        })()
        .map_err(|e| format!("WebView2 browser setup: {e}"));
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(5))
        .map_err(|_| "Browser frame setup timed out".to_string())?
}

pub fn forget(app: &AppHandle, label: &str) {
    let label = label.to_string();
    let _ = app.run_on_main_thread(move || {
        TABS.with(|tabs| tabs.borrow_mut().remove(&label));
    });
}

fn native_eval(
    webview: &ICoreWebView2,
    frame: Option<&ICoreWebView2Frame>,
    script: &str,
    tx: mpsc::Sender<Result<String, String>>,
) -> windows::core::Result<()> {
    let callback = ExecuteScriptCompletedHandler::create(Box::new(move |status, value| {
        let _ = tx.send(status.map(|()| value).map_err(|e| e.to_string()));
        Ok(())
    }));
    unsafe {
        match frame {
            Some(frame) => frame
                .cast::<ICoreWebView2Frame2>()?
                .ExecuteScript(&HSTRING::from(script), &callback),
            None => webview.ExecuteScript(&HSTRING::from(script), &callback),
        }
    }
}

fn eval_handle(
    app: &AppHandle,
    label: &str,
    handle: Option<String>,
    script: String,
) -> Result<String, String> {
    let view = crate::side_browser_host::get_side_webview(app, label)?;
    let label = label.to_string();
    let (tx, rx) = mpsc::channel();
    view.with_webview(move |native| {
        let result = (|| {
            let frame = TABS.with(|tabs| {
                let tabs = tabs.borrow();
                let tab = tabs.get(&label).ok_or("Reopen with browser_open first")?;
                if let Some(error) = &tab.error {
                    return Err(error.clone());
                }
                handle
                    .as_ref()
                    .map(|key| {
                        tab.handles
                            .get(key)
                            .cloned()
                            .ok_or("Frame was removed".to_string())
                    })
                    .transpose()
            })?;
            let webview =
                unsafe { native.controller().CoreWebView2() }.map_err(|e| e.to_string())?;
            native_eval(&webview, frame.as_ref(), &script, tx.clone()).map_err(|e| e.to_string())
        })();
        if let Err(error) = result {
            let _ = tx.send(Err(error));
        }
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(15))
        .map_err(|_| "Browser action timed out; inspect before retrying".to_string())?
}

pub fn frames(app: &AppHandle, label: &str) -> Result<Value, String> {
    let tab_label = label.to_string();
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let result = TABS.with(|tabs| {
            let tabs = tabs.borrow();
            let tab = tabs
                .get(&tab_label)
                .ok_or("Reopen with browser_open first")?;
            if let Some(error) = &tab.error {
                return Err(error.clone());
            }
            let mut handles = vec![None];
            handles.extend(tab.handles.keys().cloned().map(Some));
            Ok(handles)
        });
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    let handles = rx
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "Browser frame listing timed out")??;
    let mut found = Vec::new();
    let mut documents = HashMap::new();
    for handle in handles {
        let seed = uuid::Uuid::new_v4().to_string();
        let script = format!("(() => {{ if (!['http:', 'https:', 'about:'].includes(location.protocol)) return null; globalThis.__grokFrameDocument ||= '{seed}'; return {{frame:globalThis.__grokFrameDocument,url:location.href,main:window===top}}; }})()");
        let raw = eval_handle(app, label, handle.clone(), script)?;
        let value: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        if value.is_null() {
            continue;
        }
        let id = value["frame"]
            .as_str()
            .filter(|id| uuid::Uuid::parse_str(id).is_ok())
            .ok_or("Invalid frame document ID")?;
        documents.insert(id.to_string(), handle);
        found.push(value);
    }
    let tab_label = label.to_string();
    app.run_on_main_thread(move || {
        TABS.with(|tabs| {
            if let Some(tab) = tabs.borrow_mut().get_mut(&tab_label) {
                tab.documents = documents;
            }
        });
    })
    .map_err(|e| e.to_string())?;
    found.sort_by(|a, b| a["frame"].as_str().cmp(&b["frame"].as_str()));
    Ok(json!({"frames":found}))
}

pub fn evaluate(
    app: &AppHandle,
    label: &str,
    frame: Option<&str>,
    script: String,
) -> Result<String, String> {
    let (tx, rx) = mpsc::channel();
    let tab_label = label.to_string();
    let id = frame.map(str::to_string);
    app.run_on_main_thread(move || {
        let result = TABS.with(|tabs| {
            let tabs = tabs.borrow();
            let tab = tabs
                .get(&tab_label)
                .ok_or("Reopen with browser_open first")?;
            match id.as_ref() {
                Some(id) => tab
                    .documents
                    .get(id)
                    .cloned()
                    .ok_or("Frame is stale or missing; call browser_frames again".to_string()),
                None => Ok(None),
            }
        });
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    let handle = rx
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "Browser frame lookup timed out")??;
    let expected = serde_json::to_string(&frame).map_err(|e| e.to_string())?;
    let guarded = format!("(() => {{ if ({expected} !== null && globalThis.__grokFrameDocument !== {expected}) return {{error:'Frame document changed; call browser_frames again'}}; if (!['http:', 'https:', 'about:'].includes(location.protocol)) return {{error:'Unsupported frame URL'}}; return ({script}); }})()");
    eval_handle(app, label, handle, guarded)
}

pub fn screenshot(app: &AppHandle, label: &str) -> Result<Vec<u8>, String> {
    let view = crate::side_browser_host::get_side_webview(app, label)?;
    let (tx, rx) = mpsc::channel();
    view.with_webview(move |native| {
        let callback_tx = tx.clone();
        let callback =
            CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |status, raw| {
                let result = status.map_err(|e| e.to_string()).and_then(|()| {
                    let value: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
                    let data = value["data"]
                        .as_str()
                        .ok_or("WebView2 returned no screenshot")?;
                    base64::engine::general_purpose::STANDARD
                        .decode(data)
                        .map_err(|e| e.to_string())
                });
                let _ = callback_tx.send(result);
                Ok(())
            }));
        let result = unsafe {
            native.controller().CoreWebView2().and_then(|view| {
                view.CallDevToolsProtocolMethod(
                    &HSTRING::from("Page.captureScreenshot"),
                    &HSTRING::from(r#"{"format":"png","captureBeyondViewport":false}"#),
                    &callback,
                )
            })
        };
        if let Err(error) = result {
            let _ = tx.send(Err(error.to_string()));
        }
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(15))
        .map_err(|_| "Browser screenshot timed out".to_string())?
}
