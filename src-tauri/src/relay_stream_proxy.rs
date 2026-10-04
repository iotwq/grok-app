//! Local compatibility proxy for custom OpenAI-compatible providers.
//!
//! Some gateways (OpenCode Zen Go, etc.) append proprietary trailers such as:
//!   `{"choices":[],"x-opencode-type":"inference-cost",...}`  // missing `id`
//!   `{"type":"ping","cost":"0"}`
//! Grok Build CLI deserializes stream chunks strictly and **fatals** on these,
//! which surfaces in the App as “Agent crashed / protocol interrupted”.
//!
//! Generic Responses relays can omit `output` on `response.failed`; insert
//! the missing empty array so the CLI can read the actual provider error.
//! Host rewrites affected providers’ `base_url` to
//! `http://127.0.0.1:{port}/r/{provider_id}/v1` and stores the real upstream in
//! `app_upstream_base_url` (CLI ignores unknown keys).

use std::collections::HashMap;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::OnceLock;

use axum::body::{Body, Bytes};
use axum::extract::Request;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::Router;
use futures_util::StreamExt;
use tokio::sync::Mutex;

/// TOML key for the real upstream base (written next to rewritten localhost base).
pub const APP_UPSTREAM_BASE_URL_KEY: &str = "app_upstream_base_url";

static LISTEN_PORT: AtomicU16 = AtomicU16::new(0);
static START_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

const RELAY_CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
const RELAY_STREAM_IDLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

fn start_lock() -> &'static Mutex<()> {
    START_LOCK.get_or_init(|| Mutex::new(()))
}

/// Hosts that need SSE sanitizing before Grok Build sees them.
pub fn host_needs_stream_sanitize(base_url: &str) -> bool {
    let u = base_url.trim().to_ascii_lowercase();
    u.contains("opencode.ai") || u.contains("/zen/go")
}

fn needs_stream_proxy(base_url: &str, api_backend: &str) -> bool {
    host_needs_stream_sanitize(base_url) || api_backend.trim().eq_ignore_ascii_case("responses")
}

fn section_needs_stream_proxy(fields: &HashMap<String, String>) -> bool {
    crate::providers::normalize_provider_mode(fields.get("app_provider_mode").map(String::as_str))
        != crate::providers::PROVIDER_MODE_GROK_BUILD_PROXY
        && needs_stream_proxy(
            &effective_upstream_base(fields),
            fields
                .get("api_backend")
                .map(String::as_str)
                .unwrap_or("chat_completions"),
        )
}

/// A failed response can omit output when generation never started. The CLI
/// still requires the array before it can read the real provider error. Never
/// change status/error, fabricate output, or normalize a successful response.
fn normalize_failed_response(payload: &str) -> Option<String> {
    let mut event: serde_json::Value = serde_json::from_str(payload).ok()?;
    if event.get("type")?.as_str()? != "response.failed" {
        return None;
    }
    let response = event.get_mut("response")?.as_object_mut()?;
    if response.get("status").and_then(|v| v.as_str()) != Some("failed")
        || response.contains_key("output")
    {
        return None;
    }
    response.insert("output".into(), serde_json::json!([]));
    serde_json::to_string(&event).ok()
}

/// Whether a single SSE `data:` payload should be dropped (CLI-unsafe).
pub fn should_drop_sse_data_payload(payload: &str) -> bool {
    let raw = payload.trim();
    if raw.is_empty() || raw == "[DONE]" {
        return false;
    }
    let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) else {
        return false;
    };
    // A terminal failure is never a disposable vendor trailer.
    if v.get("type").and_then(|t| t.as_str()) == Some("response.failed") {
        return false;
    }
    if v.get("x-opencode-type").is_some() {
        return true;
    }
    if v.get("type").and_then(|t| t.as_str()) == Some("ping") {
        return true;
    }
    let has_id = v.get("id").map(|x| !x.is_null()).unwrap_or(false);
    let object = v.get("object").and_then(|o| o.as_str()).unwrap_or("");
    if object == "chat.completion.chunk" && !has_id {
        return true;
    }
    if !has_id {
        let choices_empty = v
            .get("choices")
            .and_then(|c| c.as_array())
            .map(|a| a.is_empty())
            .unwrap_or(false);
        if choices_empty || v.get("cost").is_some() || v.get("normalizedUsage").is_some() {
            return true;
        }
        if let Some(t) = v.get("type").and_then(|t| t.as_str()) {
            if t.starts_with("response.")
                && v.get("sequence_number").is_none()
                && (t.contains("delta") || t.contains("ping"))
            {
                return true;
            }
        }
    }
    false
}

/// Decode streaming UTF-8 without corrupting multi-byte chars at chunk boundaries.
///
/// `from_utf8_lossy` on each TCP/HTTP chunk independently replaces incomplete
/// trailing sequences with U+FFFD (`��`), which permanently mojibakes CJK text
/// mid-stream. Keep incomplete bytes in `pending` until the next chunk completes them.
pub fn push_utf8_stream(pending: &mut Vec<u8>, chunk: &[u8], out: &mut String) {
    if chunk.is_empty() {
        return;
    }
    pending.extend_from_slice(chunk);
    loop {
        match std::str::from_utf8(pending) {
            Ok(s) => {
                out.push_str(s);
                pending.clear();
                break;
            }
            Err(e) => {
                let good = e.valid_up_to();
                if good > 0 {
                    // SAFETY: `valid_up_to` marks a complete valid UTF-8 prefix.
                    let s = unsafe { std::str::from_utf8_unchecked(&pending[..good]) };
                    out.push_str(s);
                    pending.drain(..good);
                }
                match e.error_len() {
                    // Incomplete multi-byte sequence at end — wait for more bytes.
                    None => break,
                    // Invalid sequence — skip and replace (should be rare on API SSE).
                    Some(n) => {
                        let n = n.min(pending.len()).max(1);
                        out.push('\u{FFFD}');
                        pending.drain(..n);
                    }
                }
            }
        }
    }
}

/// Filter one SSE event block (terminated by blank line).
pub fn filter_sse_event(event: &str, sanitize_vendor: bool) -> String {
    let mut data_payloads: Vec<String> = Vec::new();
    let mut other: Vec<String> = Vec::new();
    for line in event.lines() {
        if let Some(rest) = line.strip_prefix("data:") {
            data_payloads.push(rest.trim_start().to_string());
        } else if !line.is_empty() {
            other.push(line.to_string());
        }
    }
    if data_payloads.is_empty() {
        if other.is_empty() {
            return String::new();
        }
        let mut out = other.join("\n");
        out.push_str("\n\n");
        return out;
    }
    // SSE joins data lines with a newline before interpreting the payload.
    let payload = data_payloads.join("\n");
    if sanitize_vendor && should_drop_sse_data_payload(&payload) {
        return String::new();
    }
    let Some(normalized) = normalize_failed_response(&payload) else {
        // Ordinary frames pass through byte-for-byte, without accumulating
        // the whole response or applying OpenCode-only rules to other relays.
        return if event.ends_with("\n\n") || event.ends_with("\r\n\r\n") {
            event.to_string()
        } else {
            format!("{event}\n\n")
        };
    };
    let mut out = String::new();
    for o in other {
        out.push_str(&o);
        out.push('\n');
    }
    out.push_str("data: ");
    out.push_str(&normalized);
    out.push_str("\n\n");
    out
}

/// Ensure the local proxy is listening; returns the bound port.
pub async fn ensure_started() -> Result<u16, String> {
    let port = LISTEN_PORT.load(Ordering::SeqCst);
    if port != 0 {
        return Ok(port);
    }
    let _g = start_lock().lock().await;
    let port = LISTEN_PORT.load(Ordering::SeqCst);
    if port != 0 {
        return Ok(port);
    }

    let listener = tokio::net::TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
        .await
        .map_err(|e| format!("relay stream proxy bind: {e}"))?;
    let addr = listener
        .local_addr()
        .map_err(|e| format!("relay stream proxy addr: {e}"))?;
    let bound = addr.port();

    let app = Router::new().fallback(any(proxy_fallback));
    // Publish the port only after the listener has been bound, but before the
    // serve task is spawned. If `axum::serve` fails immediately, its cleanup
    // compare-exchange below can reliably clear this exact generation; doing
    // the store after `spawn` left a race where a fast failure was overwritten
    // by the stale port value.
    LISTEN_PORT.store(bound, Ordering::SeqCst);
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!(target: "relay_stream_proxy", "serve error: {e}");
        }
        // A bound port is not useful after the serving task exits, whether it
        // returns an error or a graceful `Ok(())`. Clear only this generation
        // so a newer listener cannot be invalidated by an old task.
        let _ = LISTEN_PORT.compare_exchange(bound, 0, Ordering::SeqCst, Ordering::SeqCst);
    });

    tracing::info!(
        target: "relay_stream_proxy",
        port = bound,
        "OpenAI stream-sanitize proxy on 127.0.0.1:{bound}"
    );
    Ok(bound)
}

/// Blocking wrapper for sync provider writers / startup repair.
///
/// Safe to call from:
/// - plain sync code (no Tokio context)
/// - `spawn_blocking` threads
/// - async tasks **after** the proxy is already up (fast path — no nested runtime)
///
/// Never calls `block_on` on a Tokio worker thread (that panics:
/// "Cannot start a runtime from within a runtime"). When the port is not yet
/// bound and we are already inside a runtime, start on a dedicated OS thread.
pub fn ensure_started_blocking() -> Result<u16, String> {
    let port = LISTEN_PORT.load(Ordering::SeqCst);
    if port != 0 {
        return Ok(port);
    }

    // Nested `block_on` on a multi-thread worker panics. Detect a current
    // Handle and offload to a fresh OS thread that may safely enter the
    // Tauri global runtime.
    if tokio::runtime::Handle::try_current().is_ok() {
        return std::thread::Builder::new()
            .name("relay-proxy-start".into())
            .spawn(|| tauri::async_runtime::block_on(ensure_started()))
            .map_err(|e| format!("relay stream proxy start spawn: {e}"))?
            .join()
            .map_err(|_| "relay stream proxy start thread panicked".to_string())?;
    }

    tauri::async_runtime::block_on(ensure_started())
}

/// Local base_url written into agent-home for a provider needing compatibility.
pub fn local_proxy_base_url(provider_id: &str, port: u16) -> String {
    let id = provider_id.trim().trim_matches('/');
    format!("http://127.0.0.1:{port}/r/{id}/v1")
}

/// Resolve real upstream for display / proxy (prefer app_upstream_base_url).
pub fn effective_upstream_base(fields: &HashMap<String, String>) -> String {
    fields
        .get(APP_UPSTREAM_BASE_URL_KEY)
        .cloned()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| fields.get("base_url").cloned())
        .unwrap_or_default()
}

/// Given user-facing base_url + id, return (cli_base_url, optional_upstream_to_store).
///
/// When compatibility is needed, `cli_base_url` is loopback and `Some(real)`
/// is the true upstream endpoint (stored as `app_upstream_base_url`).
pub fn rewrite_base_for_cli(
    provider_id: &str,
    user_base_url: &str,
    api_backend: &str,
    full_path: bool,
) -> Result<(String, Option<String>), String> {
    let real = crate::providers::normalize_openai_base_url(user_base_url, api_backend, full_path);
    if real.is_empty() {
        return Ok((real, None));
    }
    // Already pointed at our proxy (and caller keeps existing upstream key).
    if is_local_sanitize_proxy_url(&real) {
        return Ok((real, None));
    }
    if !needs_stream_proxy(&real, api_backend) {
        return Ok((real, None));
    }
    let port = ensure_started_blocking()?;
    let local = local_proxy_base_url(provider_id, port);
    Ok((local, Some(real)))
}

/// True for `http://127.0.0.1:{port}/r/{id}/v1` style bases.
pub fn is_local_sanitize_proxy_url(base_url: &str) -> bool {
    let u = base_url.trim().to_ascii_lowercase();
    (u.contains("127.0.0.1") || u.contains("localhost")) && u.contains("/r/")
}

/// Re-write affected generic custom sections (startup / list repair).
pub fn repair_sanitize_proxy_bases() -> Result<bool, String> {
    let path = crate::paths::agent_config_toml();
    if !path.is_file() {
        return Ok(false);
    }
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let sections = crate::providers::parse_model_sections_for_proxy(&text);
    let mut out = text.clone();
    let mut changed = false;
    for s in sections {
        let backend = s
            .fields
            .get("api_backend")
            .map(|x| x.as_str())
            .unwrap_or("chat_completions");
        let displayed = effective_upstream_base(&s.fields);
        if !section_needs_stream_proxy(&s.fields) {
            continue;
        }
        let full_path = crate::providers::base_url_full_path_from_fields(&s.fields);
        let (cli_base, upstream) = rewrite_base_for_cli(&s.id, &displayed, backend, full_path)?;
        let Some(up) = upstream else {
            // Already local — ensure port still matches a live proxy, rebind if needed.
            let cur = s.fields.get("base_url").cloned().unwrap_or_default();
            if is_local_sanitize_proxy_url(&cur) {
                let port = ensure_started_blocking()?;
                let want = local_proxy_base_url(&s.id, port);
                if cur != want {
                    let up_keep = s
                        .fields
                        .get(APP_UPSTREAM_BASE_URL_KEY)
                        .cloned()
                        .unwrap_or_else(|| displayed.clone());
                    out = crate::providers::rewrite_section_base_urls(
                        &out,
                        &s.id,
                        &want,
                        Some(up_keep.as_str()),
                    )?;
                    changed = true;
                }
            }
            continue;
        };
        let cur = s.fields.get("base_url").cloned().unwrap_or_default();
        let cur_up = s
            .fields
            .get(APP_UPSTREAM_BASE_URL_KEY)
            .cloned()
            .unwrap_or_default();
        if cur == cli_base && cur_up == up {
            continue;
        }
        out = crate::providers::rewrite_section_base_urls(&out, &s.id, &cli_base, Some(&up))?;
        changed = true;
    }
    if changed {
        std::fs::write(&path, out).map_err(|e| e.to_string())?;
        tracing::info!(
            target: "relay_stream_proxy",
            "repaired provider base_url(s) via stream-sanitize proxy"
        );
    }
    Ok(changed)
}

async fn proxy_fallback(req: Request) -> Response {
    match proxy_request(req).await {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(target: "relay_stream_proxy", "proxy error: {e}");
            (
                StatusCode::BAD_GATEWAY,
                format!(
                    r#"{{"error":{{"message":{},"type":"proxy_error"}}}}"#,
                    json_escape(&e)
                ),
            )
                .into_response()
        }
    }
}

fn json_escape(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"error\"".into())
}

async fn proxy_request(req: Request) -> Result<Response, String> {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path = uri.path();
    let rest = path
        .strip_prefix("/r/")
        .ok_or_else(|| format!("expected /r/{{provider}}/… got {path}"))?;
    let (provider_id, after_id) = rest
        .split_once('/')
        .ok_or_else(|| "missing provider id in path".to_string())?;
    let after_v1 = after_id
        .strip_prefix("v1/")
        .or_else(|| after_id.strip_prefix("v1"))
        .unwrap_or(after_id);
    let upstream_base = lookup_upstream(provider_id)?;
    let sanitize_vendor = host_needs_stream_sanitize(&upstream_base);
    let upstream_base = upstream_base.trim_end_matches('/');
    let suffix = after_v1.trim_start_matches('/');
    let mut target = if suffix.is_empty() {
        upstream_base.to_string()
    } else {
        format!("{upstream_base}/{suffix}")
    };
    if let Some(q) = uri.query() {
        target.push('?');
        target.push_str(q);
    }

    let headers = filter_transport_headers(req.headers());
    let body_bytes = axum::body::to_bytes(req.into_body(), 32 * 1024 * 1024)
        .await
        .map_err(|e| format!("read body: {e}"))?;

    let client = {
        // Do not install a total request deadline: a healthy SSE response may
        // legitimately run for hours. Retain the existing vendor-only idle
        // deadline, which resets whenever an upstream chunk arrives.
        let mut b = reqwest::Client::builder().connect_timeout(RELAY_CONNECT_TIMEOUT);
        if sanitize_vendor {
            b = b.read_timeout(RELAY_STREAM_IDLE_TIMEOUT);
        }
        // Generic Responses retains the CLI's request lifetime/cancellation;
        // routing through compatibility must not add a new 5-minute cutoff.
        crate::proxy::apply_to_reqwest(b)
            .build()
            .map_err(|e| e.to_string())?
    };
    let req_method =
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::POST);
    let mut rb = client.request(req_method, &target);
    for (k, v) in headers.iter() {
        if let Ok(name) = reqwest::header::HeaderName::from_bytes(k.as_str().as_bytes()) {
            if let Ok(val) = reqwest::header::HeaderValue::from_bytes(v.as_bytes()) {
                rb = rb.header(name, val);
            }
        }
    }
    if !body_bytes.is_empty() {
        rb = rb.body(body_bytes.to_vec());
    }

    let upstream = rb.send().await.map_err(|e| format!("upstream: {e}"))?;
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let response_headers = filter_transport_headers(upstream.headers());
    let content_type = upstream
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let is_event_stream = content_type.contains("text/event-stream");

    if !is_event_stream {
        let bytes = upstream
            .bytes()
            .await
            .map_err(|e| format!("upstream body: {e}"))?;
        let mut response = Response::builder().status(status);
        *response.headers_mut().expect("valid response builder") = response_headers;
        return response.body(Body::from(bytes)).map_err(|e| e.to_string());
    }

    // Byte pending holds incomplete UTF-8 across chunk boundaries; line_buf is
    // fully decoded text ready for SSE event framing (`\n\n`).
    let byte_stream = upstream.bytes_stream();
    let filtered = async_stream::stream! {
        let mut stream = byte_stream;
        let mut utf8_pending: Vec<u8> = Vec::new();
        let mut line_buf = String::new();
        loop {
            let item = if sanitize_vendor {
                match tokio::time::timeout(RELAY_STREAM_IDLE_TIMEOUT, stream.next()).await {
                    Ok(item) => item,
                    Err(_) => {
                        let msg = "upstream SSE idle timeout";
                        tracing::warn!(target: "relay_stream_proxy", "{msg}");
                        yield Ok::<Bytes, Infallible>(Bytes::from(format_sse_error(msg)));
                        break;
                    }
                }
            } else {
                stream.next().await
            };
            let Some(item) = item else { break };
            match item {
                Ok(chunk) => {
                    push_utf8_stream(&mut utf8_pending, &chunk, &mut line_buf);
                    while let Some((pos, delimiter_len)) = find_sse_event_end(&line_buf) {
                        let end = pos + delimiter_len;
                        let event = line_buf[..end].to_string();
                        line_buf = line_buf[end..].to_string();
                        let kept = filter_sse_event(&event, sanitize_vendor);
                        if !kept.is_empty() {
                            yield Ok::<Bytes, Infallible>(Bytes::from(kept));
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!(target: "relay_stream_proxy", "upstream stream: {e}");
                    yield Ok::<Bytes, Infallible>(Bytes::from(format_sse_error(&format!("upstream SSE read failed: {e}"))));
                    break;
                }
            }
        }
        // Flush any leftover incomplete UTF-8 as lossy (stream ended mid-char).
        if !utf8_pending.is_empty() {
            line_buf.push_str(&String::from_utf8_lossy(&utf8_pending));
            utf8_pending.clear();
        }
        if !line_buf.is_empty() {
            let kept = filter_sse_event(&line_buf, sanitize_vendor);
            if !kept.is_empty() {
                yield Ok::<Bytes, Infallible>(Bytes::from(kept));
            }
        }
    };

    let mut response = Response::builder().status(status);
    *response.headers_mut().expect("valid response builder") = response_headers;
    response
        .header(header::CONTENT_TYPE, "text/event-stream")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from_stream(filtered))
        .map_err(|e| e.to_string())
}

/// Return the first complete SSE event boundary, accepting both the LF form
/// emitted by most providers and the strict CRLF form required by the SSE spec.
fn find_sse_event_end(input: &str) -> Option<(usize, usize)> {
    let lf = input.find("\n\n").map(|pos| (pos, 2));
    let crlf = input.find("\r\n\r\n").map(|pos| (pos, 4));
    match (lf, crlf) {
        (Some(a), Some(b)) => Some(if a.0 <= b.0 { a } else { b }),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    }
}

fn format_sse_error(message: &str) -> String {
    let payload = serde_json::json!({
        "error": {
            "message": message,
            "type": "upstream_stream_error"
        }
    });
    format!("event: error\ndata: {payload}\n\n")
}

fn filter_transport_headers(src: &HeaderMap) -> HeaderMap {
    let mut out = HeaderMap::new();
    for (k, v) in src.iter() {
        let name = k.as_str().to_ascii_lowercase();
        if matches!(
            name.as_str(),
            "host" | "connection" | "content-length" | "transfer-encoding" | "accept-encoding"
        ) {
            continue;
        }
        out.insert(k.clone(), v.clone());
    }
    out
}

fn lookup_upstream(provider_id: &str) -> Result<String, String> {
    let path = crate::paths::agent_config_toml();
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let sections = crate::providers::parse_model_sections_for_proxy(&text);
    let sec = sections
        .iter()
        .find(|s| s.id == provider_id)
        .ok_or_else(|| format!("unknown provider `{provider_id}` for proxy"))?;
    let up = effective_upstream_base(&sec.fields);
    if up.is_empty() {
        return Err(format!("provider `{provider_id}` has no upstream base_url"));
    }
    if is_local_sanitize_proxy_url(&up) {
        return Err(format!(
            "provider `{provider_id}` missing {APP_UPSTREAM_BASE_URL_KEY}"
        ));
    }
    Ok(up)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn failed_event() -> serde_json::Value {
        serde_json::json!({
            "type": "response.failed", "sequence_number": 7,
            "response": {
                "id": "resp_test", "object": "response", "created_at": 1,
                "model": "test", "status": "failed",
                "error": {"code": "gateway_concurrency_limit", "message": "账号并发已达上限"}
            }
        })
    }

    #[test]
    fn failure_normalization_only_adds_missing_output() {
        let original = failed_event();
        let mut expected = original.clone();
        expected["response"]["output"] = serde_json::json!([]);
        let normalized = normalize_failed_response(&original.to_string()).unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&normalized).unwrap(),
            expected
        );
        assert!(normalize_failed_response(&normalized).is_none());
        expected["response"]["output"] =
            serde_json::json!([{"type": "message", "content": "partial"}]);
        assert!(normalize_failed_response(&expected.to_string()).is_none());
        let mut completed = original;
        completed["type"] = serde_json::json!("response.completed");
        completed["response"]["status"] = serde_json::json!("completed");
        assert!(normalize_failed_response(&completed.to_string()).is_none());
    }

    #[test]
    fn multiline_crlf_failure_retains_event_identity_and_error() {
        let payload = serde_json::to_string_pretty(&failed_event()).unwrap();
        let data = payload
            .lines()
            .map(|line| format!("data: {line}\r\n"))
            .collect::<String>();
        let frame = format!("id: failure-7\r\nevent: response.failed\r\n{data}\r\n");
        let out = filter_sse_event(&frame, false);
        assert!(out.contains("id: failure-7\nevent: response.failed\n"));
        let data = out.lines().find_map(|l| l.strip_prefix("data: ")).unwrap();
        let mut expected = failed_event();
        expected["response"]["output"] = serde_json::json!([]);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(data).unwrap(),
            expected
        );
    }

    #[test]
    fn generic_frames_keep_original_bytes_and_do_not_use_vendor_drop_rules() {
        for frame in [
            "event: response.output_text.delta\r\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"你好\"}\r\n\r\n",
            "data: [DONE]\n\n",
            "data: {\"type\":\"ping\"}\n\n",
        ] {
            assert_eq!(filter_sse_event(frame, false), frame);
        }
        let mut failure = failed_event();
        failure["cost"] = serde_json::json!(0);
        assert!(!should_drop_sse_data_payload(&failure.to_string()));
    }

    #[test]
    fn routes_generic_responses_but_preserves_native_relay_contract() {
        let mut fields = HashMap::from([
            ("base_url".into(), "https://relay.example/v1".into()),
            ("api_backend".into(), "responses".into()),
        ]);
        assert!(section_needs_stream_proxy(&fields));
        fields.insert("app_provider_mode".into(), "grok_build_proxy".into());
        assert!(!section_needs_stream_proxy(&fields));
        fields.remove("app_provider_mode");
        fields.insert("api_backend".into(), "chat_completions".into());
        assert!(!section_needs_stream_proxy(&fields));
        fields.insert("base_url".into(), "https://opencode.ai/zen/go/v1".into());
        assert!(section_needs_stream_proxy(&fields));
    }

    #[test]
    fn loopback_proxy_streams_before_completion_and_preserves_provider_errors() {
        let _lock = crate::paths::APP_HOME_ENV_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        struct TestScope {
            home: std::path::PathBuf,
            previous: Option<std::ffi::OsString>,
            server: Option<tokio::task::AbortHandle>,
        }
        impl Drop for TestScope {
            fn drop(&mut self) {
                if let Some(server) = &self.server {
                    server.abort();
                }
                match &self.previous {
                    Some(previous) => std::env::set_var("GROK_APP_HOME", previous),
                    None => std::env::remove_var("GROK_APP_HOME"),
                }
                let _ = std::fs::remove_dir_all(&self.home);
            }
        }
        let mut scope = TestScope {
            home: std::env::temp_dir().join(format!("grok-relay-test-{}", uuid::Uuid::new_v4())),
            previous: std::env::var_os("GROK_APP_HOME"),
            server: None,
        };
        std::fs::create_dir_all(scope.home.join("agent-home")).unwrap();
        std::env::set_var("GROK_APP_HOME", &scope.home);
        let settings = crate::store::AppSettings {
            proxy_mode: "none".into(),
            ..Default::default()
        };
        std::fs::write(
            scope.home.join("settings.json"),
            serde_json::to_vec(&settings).unwrap(),
        )
        .unwrap();

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let upstream = format!("http://{}/v1", listener.local_addr().unwrap());
        let config = crate::paths::agent_config_toml();
        std::fs::write(&config, format!(
            "[model.audit]\nbase_url = \"{upstream}\"\napi_backend = \"responses\"\n\n[model.native]\nbase_url = \"https://native.example/v1\"\napi_backend = \"responses\"\napp_provider_mode = \"grok_build_proxy\"\n"
        )).unwrap();
        assert!(repair_sanitize_proxy_bases().unwrap());
        assert!(
            !repair_sanitize_proxy_bases().unwrap(),
            "repair must be idempotent"
        );
        let sections = crate::providers::parse_model_sections_for_proxy(
            &std::fs::read_to_string(&config).unwrap(),
        );
        let audit = sections.iter().find(|s| s.id == "audit").unwrap();
        let local_base = audit.fields["base_url"].clone();
        assert!(is_local_sanitize_proxy_url(&local_base));
        assert_eq!(effective_upstream_base(&audit.fields), upstream);
        let native = sections.iter().find(|s| s.id == "native").unwrap();
        assert_eq!(native.fields["base_url"], "https://native.example/v1");
        assert!(!native.fields.contains_key(APP_UPSTREAM_BASE_URL_KEY));

        tauri::async_runtime::block_on(async {
            let release = std::sync::Arc::new(tokio::sync::Notify::new());
            let gate = release.clone();
            let delta = "event: response.output_text.delta\r\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"你好\"}\r\n\r\n";
            let app = Router::new().fallback(any(move |req: Request| {
                let gate = gate.clone();
                async move {
                    assert_eq!(req.method(), axum::http::Method::POST);
                    assert_eq!(req.uri().path(), "/v1/responses");
                    assert_eq!(req.headers()[header::AUTHORIZATION], "Bearer test-key");
                    let status_case = req.uri().query() == Some("case=status");
                    assert!(status_case || req.uri().query() == Some("case=stream"));
                    let body = axum::body::to_bytes(req.into_body(), 1024).await.unwrap();
                    assert_eq!(body.as_ref(), br#"{"model":"audit","stream":true}"#);
                    if status_case {
                        return Response::builder()
                            .status(StatusCode::TOO_MANY_REQUESTS)
                            .header(header::CONTENT_TYPE, "application/json")
                            .header(header::RETRY_AFTER, "7")
                            .body(Body::from(r#"{"error":{"code":"gateway_concurrency_limit"}}"#))
                            .unwrap();
                    }
                    let stream = async_stream::stream! {
                        let split = delta.find('你').unwrap() + 1;
                        yield Ok::<_, Infallible>(Bytes::copy_from_slice(&delta.as_bytes()[..split]));
                        yield Ok::<_, Infallible>(Bytes::copy_from_slice(&delta.as_bytes()[split..]));
                        gate.notified().await;
                        yield Ok::<_, Infallible>(Bytes::from(format!("event: response.failed\ndata: {}\n\n", failed_event())));
                    };
                    Response::builder()
                        .header(header::CONTENT_TYPE, "text/event-stream")
                        .header("x-request-id", "test-request")
                        .body(Body::from_stream(stream))
                        .unwrap()
                }
            }));
            let listener = tokio::net::TcpListener::from_std(listener).unwrap();
            let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
            scope.server = Some(server.abort_handle());
            let client = reqwest::Client::builder()
                .no_proxy()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .unwrap();
            let request = |case: &str| {
                client
                    .post(format!("{local_base}/responses?case={case}"))
                    .bearer_auth("test-key")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(r#"{"model":"audit","stream":true}"#)
            };
            let response = request("stream").send().await.unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(response.headers()["x-request-id"], "test-request");
            let mut stream = response.bytes_stream();
            let first = tokio::time::timeout(std::time::Duration::from_secs(2), stream.next())
                .await
                .expect("first delta must arrive before upstream completes")
                .unwrap()
                .unwrap();
            assert_eq!(first.as_ref(), delta.as_bytes());
            release.notify_one();
            let mut tail = Vec::new();
            while let Some(chunk) = stream.next().await {
                tail.extend_from_slice(&chunk.unwrap());
            }
            let tail = String::from_utf8(tail).unwrap();
            let data = tail.lines().find_map(|l| l.strip_prefix("data: ")).unwrap();
            let mut expected = failed_event();
            expected["response"]["output"] = serde_json::json!([]);
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(data).unwrap(),
                expected
            );

            let response = request("status").send().await.unwrap();
            assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
            assert_eq!(response.headers()[header::RETRY_AFTER], "7");
            assert_eq!(
                response.text().await.unwrap(),
                r#"{"error":{"code":"gateway_concurrency_limit"}}"#
            );
            server.abort();
            let _ = server.await;
        });
    }

    #[test]
    fn drops_opencode_cost_frame() {
        let raw = r#"{"choices":[],"x-opencode-type":"inference-cost","cost":"0.0003"}"#;
        assert!(should_drop_sse_data_payload(raw));
    }

    #[test]
    fn drops_live_opencode_cost_trailer() {
        // Exact shape from Grok Build stderr (missing `id` → ChatCompletionChunk fail).
        let raw = r#"{"choices":[],"x-opencode-type":"inference-cost","cost":"0.00033520","normalizedUsage":{"inputTokens":59,"outputTokens":17,"reasoningTokens":48,"cacheReadTokens":384,"cacheWrite5mTokens":0,"cacheWrite1hTokens":0}}"#;
        assert!(should_drop_sse_data_payload(raw));
    }

    #[test]
    fn drops_ping() {
        assert!(should_drop_sse_data_payload(
            r#"{"type":"ping","cost":"0"}"#
        ));
    }

    #[test]
    fn keeps_normal_chunk() {
        let raw =
            r#"{"id":"x","object":"chat.completion.chunk","choices":[{"delta":{"content":"hi"}}]}"#;
        assert!(!should_drop_sse_data_payload(raw));
    }

    #[test]
    fn keeps_done() {
        assert!(!should_drop_sse_data_payload("[DONE]"));
    }

    #[test]
    fn filter_event_drops_cost() {
        let ev = "data: {\"choices\":[],\"x-opencode-type\":\"inference-cost\",\"cost\":\"1\"}\n\n";
        assert!(filter_sse_event(ev, true).is_empty());
    }

    #[test]
    fn filter_event_keeps_chunk() {
        let ev = "data: {\"id\":\"1\",\"object\":\"chat.completion.chunk\",\"choices\":[]}\n\n";
        let out = filter_sse_event(ev, true);
        assert!(out.contains("chat.completion.chunk"));
    }

    #[test]
    fn finds_lf_and_crlf_event_boundaries() {
        assert_eq!(find_sse_event_end("data: x\n\nrest"), Some((7, 2)));
        assert_eq!(find_sse_event_end("data: x\r\n\r\nrest"), Some((7, 4)));
        assert_eq!(find_sse_event_end("data: x\nrest"), None);
    }

    #[test]
    fn structured_stream_error_is_sse() {
        let out = format_sse_error("upstream broke");
        assert!(out.starts_with("event: error\n"));
        assert!(out.contains("upstream broke"));
        assert!(out.ends_with("\n\n"));
    }

    #[test]
    fn host_detects_opencode() {
        assert!(host_needs_stream_sanitize("https://opencode.ai/zen/go/v1"));
        assert!(!host_needs_stream_sanitize("https://api.deepseek.com/v1"));
    }

    #[test]
    fn ensure_started_blocking_fast_path_when_port_set() {
        // Use the persistent runtime so this test never advertises a fake port
        // to provider tests running concurrently.
        let port = ensure_started_blocking().expect("start proxy");
        let got = ensure_started_blocking().expect("fast path");
        assert_eq!(got, port);
    }

    #[test]
    fn utf8_stream_survives_cjk_split_mid_char() {
        // Session 2ef3bf77: proxy used from_utf8_lossy per chunk → 帮��处理.
        let text = "帮你处理自动化流程定时任务";
        let bytes = text.as_bytes();
        let mut pending = Vec::new();
        let mut out = String::new();
        // Split every byte so every multi-byte CJK char is fragmented.
        for b in bytes {
            push_utf8_stream(&mut pending, &[*b], &mut out);
        }
        assert!(pending.is_empty());
        assert_eq!(out, text);
        assert!(!out.contains('\u{FFFD}'));
    }

    #[test]
    fn utf8_stream_lossy_per_chunk_would_mojibake() {
        // Document the old bug: independent lossy decode corrupts CJK.
        let text = "帮你";
        let bytes = text.as_bytes();
        // Split after first byte of 帮 (E5, should be E5 B8 AE).
        let a = &bytes[..1];
        let b = &bytes[1..];
        let broken = format!(
            "{}{}",
            String::from_utf8_lossy(a),
            String::from_utf8_lossy(b)
        );
        assert!(broken.contains('\u{FFFD}') || broken != text);

        let mut pending = Vec::new();
        let mut out = String::new();
        push_utf8_stream(&mut pending, a, &mut out);
        push_utf8_stream(&mut pending, b, &mut out);
        assert_eq!(out, text);
    }
}
