//! Native WKWebView observation: viewport pixels and isolated-world frame handles.
//! All ObjC objects stay on the main thread; only owned strings/bytes cross threads.
use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::{define_class, msg_send, AnyThread, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
use objc2_foundation::{NSDictionary, NSError, NSObject, NSObjectProtocol, NSString};
use objc2_web_kit::{
    WKContentWorld, WKFrameInfo, WKScriptMessage, WKScriptMessageHandler, WKSnapshotConfiguration,
    WKUserContentController, WKUserScript, WKUserScriptInjectionTime, WKWebView,
};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::mpsc;
use std::time::Duration;
use tauri::AppHandle;

const WORLD: &str = "GrokBrowserAutomation";
const HANDLER: &str = "grokBrowserFrame";
const REGISTER: &str = r#"(() => {
  if (!['http:', 'https:', 'about:'].includes(location.protocol)) return;
  // randomUUID is absent on non-secure HTTP pages and older WebKit versions.
  // This polyfill is confined to our isolated world, never the website's globals.
  if (!crypto.randomUUID) crypto.randomUUID = () => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const hex = Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  };
  const id = crypto.randomUUID();
  globalThis.__grokFrameDocument = id;
  const report = (removed = false, fresh = false) => webkit.messageHandlers.grokBrowserFrame.postMessage(JSON.stringify({id, url:location.href, removed, fresh}));
  report(false, true);
  addEventListener('pageshow', () => report());
  addEventListener('pagehide', () => report(true));
})()"#;

struct Frame {
    info: Retained<WKFrameInfo>,
    url: String,
}

#[derive(Default)]
struct FrameState {
    frames: RefCell<HashMap<String, Frame>>,
}

define_class!(
    // NSObject has no additional subclass invariants. WebKit invokes this on the main thread.
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[ivars = FrameState]
    struct FrameObserver;
    unsafe impl NSObjectProtocol for FrameObserver {}
    unsafe impl WKScriptMessageHandler for FrameObserver {
        #[unsafe(method(userContentController:didReceiveScriptMessage:))]
        fn received(&self, _controller: &WKUserContentController, message: &WKScriptMessage) {
            // The handler exists only in our isolated world and accepts registration, never commands.
            let body = unsafe { message.body() };
            let Some(body) = body.downcast_ref::<NSString>() else {
                return;
            };
            let Ok(value) = serde_json::from_str::<Value>(&body.to_string()) else {
                return;
            };
            let Some(id) = value["id"]
                .as_str()
                .filter(|id| uuid::Uuid::parse_str(id).is_ok())
            else {
                return;
            };
            let info = unsafe { message.frameInfo() };
            let mut frames = self.ivars().frames.borrow_mut();
            if value["removed"] == true {
                frames.remove(id);
                return;
            }
            // A new main document starts before its children. On history restore,
            // child pageshow events precede the main one: do not erase those frames.
            if unsafe { info.isMainFrame() } && value["fresh"] == true {
                frames.clear();
            }
            if frames.len() < 128 || frames.contains_key(id) {
                frames.insert(
                    id.to_string(),
                    Frame {
                        info,
                        url: value["url"].as_str().unwrap_or("").to_string(),
                    },
                );
            }
        }
    }
);

thread_local! {
    static OBSERVERS: RefCell<HashMap<String, Retained<FrameObserver>>> = RefCell::new(HashMap::new());
}

fn world(mtm: MainThreadMarker) -> Retained<WKContentWorld> {
    unsafe { WKContentWorld::worldWithName(&NSString::from_str(WORLD), mtm) }
}

/// Install once before the first automation-controlled navigation. Reloading re-registers all frames.
pub fn install(app: &AppHandle, label: &str) -> Result<(), String> {
    let view = crate::side_browser_host::get_side_webview(app, label)?;
    let label = label.to_string();
    let (tx, rx) = mpsc::channel();
    view.with_webview(move |native| {
        let result = (|| unsafe {
            let wk = &*(native.inner() as *const WKWebView);
            let mtm = MainThreadMarker::new().ok_or("WebKit requires main thread")?;
            // macOS 11+ public API. Do not crash older supported macOS versions.
            if !wk.respondsToSelector(
                objc2::sel!(evaluateJavaScript:inFrame:inContentWorld:completionHandler:),
            ) {
                return Err("Browser frame automation requires macOS 11 or newer".to_string());
            }
            OBSERVERS.with(|observers| {
                let mut observers = observers.borrow_mut();
                if observers.contains_key(&label) {
                    return Ok(());
                }
                let observer = FrameObserver::alloc(mtm).set_ivars(FrameState::default());
                let observer: Retained<FrameObserver> = msg_send![super(observer), init];
                let controller = wk.configuration().userContentController();
                controller.addScriptMessageHandler_contentWorld_name(
                    ProtocolObject::from_ref(&*observer),
                    &world(mtm),
                    &NSString::from_str(HANDLER),
                );
                let script =
                    WKUserScript::initWithSource_injectionTime_forMainFrameOnly_inContentWorld(
                        WKUserScript::alloc(mtm),
                        &NSString::from_str(REGISTER),
                        WKUserScriptInjectionTime::AtDocumentStart,
                        false,
                        &world(mtm),
                    );
                controller.addUserScript(&script);
                observers.insert(label, observer);
                Ok(())
            })
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(5))
        .map_err(|_| "Browser frame setup timed out".to_string())?
}

/// Called for UI and Agent closes so native frame handles cannot outlive their tab.
pub fn forget(app: &AppHandle, label: &str) {
    let label = label.to_string();
    let _ = app.run_on_main_thread(move || {
        OBSERVERS.with(|map| {
            map.borrow_mut().remove(&label);
        });
    });
}

pub fn frames(app: &AppHandle, label: &str) -> Result<Value, String> {
    let label = label.to_string();
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let result: Result<Value, String> = OBSERVERS.with(|map| {
            let map = map.borrow();
            let observer = map
                .get(&label)
                .ok_or("Reopen the browser with browser_open to discover frames")?;
            let mut frames: Vec<Value> = observer.ivars().frames.borrow().iter().map(|(id, frame)| {
                json!({"frame":id,"url":frame.url,"main":unsafe { frame.info.isMainFrame() }})
            }).collect();
            frames.sort_by(|a, b| a["frame"].as_str().cmp(&b["frame"].as_str()));
            Ok(json!({"frames":frames}))
        });
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(5))
        .map_err(|_| "Browser frame listing timed out".to_string())?
}

/// Target native WKFrameInfo in an isolated content world, including cross-origin frames.
pub fn evaluate(
    app: &AppHandle,
    label: &str,
    frame: Option<&str>,
    script: String,
) -> Result<String, String> {
    let view = crate::side_browser_host::get_side_webview(app, label)?;
    let label = label.to_string();
    let frame = frame.map(str::to_string);
    let (tx, rx) = mpsc::channel();
    view.with_webview(move |native| {
        let result = (|| unsafe {
            let wk = &*(native.inner() as *const WKWebView);
            let mtm = MainThreadMarker::new().ok_or("WebKit requires main thread")?;
            let native_frame = OBSERVERS.with(|map| {
                let map = map.borrow();
                let observer = map.get(&label).ok_or("Reopen the browser with browser_open first")?;
                let frame = match frame.as_ref() {
                    Some(id) => Some(observer.ivars().frames.borrow().get(id).ok_or("Frame is stale or missing; call browser_frames again")?.info.clone()),
                    None => None,
                };
                Ok::<_, String>(frame)
            })?;
            let expected = serde_json::to_string(&frame).map_err(|e| e.to_string())?;
            let guarded = format!("JSON.stringify((() => {{ if ({expected} !== null && globalThis.__grokFrameDocument !== {expected}) return {{error:'Frame document changed; call browser_frames again'}}; if (!['http:', 'https:', 'about:'].includes(location.protocol)) return {{error:'Unsupported frame URL'}}; return ({script}); }})())");
            let callback_tx = tx.clone();
            let callback = RcBlock::new(move |value: *mut AnyObject, error: *mut NSError| {
                let result = if let Some(error) = error.as_ref() {
                    Err(format!("Frame evaluation failed: {}", error.localizedDescription()))
                } else if let Some(value) = value.as_ref().and_then(|v| v.downcast_ref::<NSString>()) {
                    Ok(value.to_string())
                } else { Err("Frame returned no result; inspect before retrying".into()) };
                let _ = callback_tx.send(result);
            });
            wk.evaluateJavaScript_inFrame_inContentWorld_completionHandler(
                &NSString::from_str(&guarded), native_frame.as_deref(), &world(mtm), Some(&callback),
            );
            Ok::<_, String>(())
        })();
        if let Err(error) = result { let _ = tx.send(Err(error)); }
    }).map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(15))
        .map_err(|_| "Frame evaluation timed out; inspect before retrying".to_string())?
}

/// Snapshot only this WKWebView's current visible viewport, including iframe pixels.
pub fn screenshot(app: &AppHandle, label: &str) -> Result<Vec<u8>, String> {
    let view = crate::side_browser_host::get_side_webview(app, label)?;
    let (tx, rx) = mpsc::channel();
    view.with_webview(move |native| unsafe {
        let wk = &*(native.inner() as *const WKWebView);
        let config = WKSnapshotConfiguration::new(
            MainThreadMarker::new().expect("with_webview main thread"),
        );
        let callback = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
            let result = (|| {
                if let Some(error) = error.as_ref() {
                    return Err(error.localizedDescription().to_string());
                }
                let image = image.as_ref().ok_or("WebKit returned no screenshot")?;
                let tiff = image
                    .TIFFRepresentation()
                    .ok_or("Screenshot encoding failed")?;
                let bitmap = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &tiff)
                    .ok_or("Screenshot bitmap unavailable")?;
                let png = bitmap
                    .representationUsingType_properties(
                        NSBitmapImageFileType::PNG,
                        &NSDictionary::new(),
                    )
                    .ok_or("PNG encoding failed")?;
                Ok(png.to_vec())
            })();
            let _ = tx.send(result);
        });
        wk.takeSnapshotWithConfiguration_completionHandler(Some(&config), &callback);
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(15))
        .map_err(|_| "Browser screenshot timed out".to_string())?
}
