//! WebKitGTK: viewport pixels and per-document commands in an isolated world.
//! Native reply objects stay on the GTK thread. Only JSON/PNG cross to workers.
use gtk::glib::{self, prelude::*, translate::*};
use javascriptcore::ValueExt;
use serde_json::{json, Value};
use std::{cell::RefCell, collections::HashMap, rc::Rc, sync::mpsc, time::Duration};
use tauri::AppHandle;
use webkit2gtk::{
    UserContentInjectedFrames, UserContentManagerExt, UserScript, UserScriptInjectionTime,
    WebViewExt,
};

const WORLD: &str = "GrokBrowserAutomation";
const HANDLER: &str = "grokBrowserFrame";
type ReplySender = mpsc::Sender<Result<String, String>>;

// webkit2gtk 2.0 exposes the reply API in ffi but omits its safe wrapper/signal.
glib::wrapper! {
    struct ScriptReply(Shared<webkit2gtk::ffi::WebKitScriptMessageReply>);
    match fn {
        ref => |ptr| webkit2gtk::ffi::webkit_script_message_reply_ref(ptr),
        unref => |ptr| webkit2gtk::ffi::webkit_script_message_reply_unref(ptr),
        type_ => || webkit2gtk::ffi::webkit_script_message_reply_get_type(),
    }
}
struct Reply {
    native: ScriptReply,
    context: javascriptcore::Context,
}
impl Reply {
    fn send(self, value: Value) {
        let value = javascriptcore::Value::new_string(&self.context, Some(&value.to_string()));
        unsafe {
            webkit2gtk::ffi::webkit_script_message_reply_return_value(
                self.native.to_glib_none().0,
                value.to_glib_none().0,
            );
        }
    }
}
struct Frame {
    url: String,
    main: bool,
    waiting: Option<Reply>,
    pending: Option<(String, ReplySender)>,
}
impl Drop for Frame {
    fn drop(&mut self) {
        if let Some(reply) = self.waiting.take() {
            reply.send(json!({"stop":true}));
        }
        if let Some((_, tx)) = self.pending.take() {
            let _ = tx.send(Err(
                "Frame was removed or navigated; call browser_frames again".into(),
            ));
        }
    }
}
type Frames = Rc<RefCell<HashMap<String, Frame>>>;
thread_local! {
    static TABS: RefCell<HashMap<String, Frames>> = RefCell::new(HashMap::new());
}

pub fn install(app: &AppHandle, label: &str) -> Result<(), String> {
    let view = crate::side_browser_host::get_side_webview(app, label)?;
    let label = label.to_string();
    let (tx, rx) = mpsc::channel();
    view.with_webview(move |native| {
        let result = TABS.with(|tabs| {
            let mut tabs = tabs.borrow_mut();
            if tabs.contains_key(&label) {
                return Ok(());
            }
            let manager = native
                .inner()
                .user_content_manager()
                .ok_or("Missing WebKit content manager")?;
            if !manager.register_script_message_handler_with_reply(HANDLER, WORLD) {
                return Err("Could not register browser frame handler".to_string());
            }
            let frames: Frames = Rc::default();
            let observed = Rc::downgrade(&frames);
            manager.connect_local(
                "script-message-with-reply-received::grokBrowserFrame",
                false,
                move |args| {
                    let value = args[1]
                        .get::<javascriptcore::Value>()
                        .expect("WebKit JSCValue signal");
                    let reply = Reply {
                        native: args[2].get::<ScriptReply>().expect("WebKit reply signal"),
                        context: value.context().expect("WebKit JSC context"),
                    };
                    if let Some(frames) = observed.upgrade() {
                        receive(&mut frames.borrow_mut(), value.to_str().as_str(), reply);
                    } else {
                        reply.send(json!({"stop":true}));
                    }
                    Some(true.to_value())
                },
            );
            let script = format!(
                "({})({});",
                include_str!("browser_linux.js"),
                include_str!("browser_automation.js")
            );
            manager.add_script(&UserScript::for_world(
                &script,
                UserContentInjectedFrames::AllFrames,
                UserScriptInjectionTime::Start,
                WORLD,
                &[],
                &[],
            ));
            tabs.insert(label, frames);
            Ok(())
        });
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(5))
        .map_err(|_| "Browser frame setup timed out".to_string())?
}

fn receive(frames: &mut HashMap<String, Frame>, raw: &str, reply: Reply) {
    let Ok(message) = serde_json::from_str::<Value>(raw) else {
        reply.send(json!({"stop":true}));
        return;
    };
    let Some(id) = message["id"]
        .as_str()
        .filter(|id| uuid::Uuid::parse_str(id).is_ok())
    else {
        reply.send(json!({"stop":true}));
        return;
    };
    match message["kind"].as_str() {
        Some("ready") => {
            if message["main"] == true && message["fresh"] == true {
                frames.clear();
            }
            if frames.len() >= 128 && !frames.contains_key(id) {
                reply.send(json!({"stop":true}));
                return;
            }
            let frame = frames.entry(id.to_string()).or_insert_with(|| Frame {
                url: String::new(),
                main: message["main"] == true,
                waiting: None,
                pending: None,
            });
            frame.url = message["url"].as_str().unwrap_or_default().to_string();
            frame.waiting = Some(reply);
            if frame
                .pending
                .as_ref()
                .is_some_and(|(request, _)| message["request"] == *request)
            {
                let (_, tx) = frame.pending.take().unwrap();
                let _ = tx.send(Ok(message["value"].to_string()));
            }
        }
        Some("gone") => {
            frames.remove(id);
            reply.send(json!({}));
        }
        _ => reply.send(json!({"stop":true})),
    }
}

pub fn forget(app: &AppHandle, label: &str) {
    let label = label.to_string();
    let _ = app.run_on_main_thread(move || {
        TABS.with(|tabs| tabs.borrow_mut().remove(&label));
    });
}

pub fn frames(app: &AppHandle, label: &str) -> Result<Value, String> {
    let label = label.to_string();
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let result = TABS.with(|tabs| {
            let tabs = tabs.borrow();
            let frames = tabs
                .get(&label)
                .ok_or("Reopen with browser_open to discover frames")?;
            let mut values: Vec<_> = frames
                .borrow()
                .iter()
                .map(|(id, frame)| json!({"frame":id,"url":frame.url,"main":frame.main}))
                .collect();
            values.sort_by(|a, b| a["frame"].as_str().cmp(&b["frame"].as_str()));
            Ok::<_, String>(json!({"frames":values}))
        });
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(5))
        .map_err(|_| "Browser frame listing timed out".to_string())?
}

pub fn execute(
    app: &AppHandle,
    label: &str,
    id: Option<&str>,
    action: String,
    args: Value,
) -> Result<String, String> {
    let label = label.to_string();
    let id = id.map(str::to_string);
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let result = TABS.with(|tabs| {
            let tabs = tabs.borrow();
            let frames = tabs.get(&label).ok_or("Reopen with browser_open first")?;
            let mut frames = frames.borrow_mut();
            let frame = match id.as_ref() {
                Some(id) => frames.get_mut(id),
                None => frames.values_mut().find(|frame| frame.main),
            }
            .ok_or("Frame is stale or missing; call browser_frames again")?;
            let reply = frame
                .waiting
                .take()
                .ok_or("Frame is busy or loading; inspect it before retrying")?;
            let request = uuid::Uuid::new_v4().to_string();
            frame.pending = Some((request.clone(), tx.clone()));
            reply.send(json!({"request":request,"action":action,"args":args}));
            Ok::<_, String>(())
        });
        if let Err(error) = result {
            let _ = tx.send(Err(error));
        }
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(15))
        .map_err(|_| "Browser action timed out; inspect before retrying".to_string())?
}

pub fn screenshot(app: &AppHandle, label: &str) -> Result<Vec<u8>, String> {
    let view = crate::side_browser_host::get_side_webview(app, label)?;
    let (tx, rx) = mpsc::channel();
    view.with_webview(move |native| {
        native.inner().snapshot(
            webkit2gtk::SnapshotRegion::Visible,
            webkit2gtk::SnapshotOptions::NONE,
            None::<&gtk::gio::Cancellable>,
            move |result| {
                let result = result.map_err(|e| e.to_string()).and_then(|surface| {
                    let mut png = Vec::new();
                    surface.write_to_png(&mut png).map_err(|e| e.to_string())?;
                    Ok(png)
                });
                let _ = tx.send(result);
            },
        );
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(15))
        .map_err(|_| "Browser screenshot timed out".to_string())?
}
