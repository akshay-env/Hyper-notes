// Provider-agnostic LLM streaming, moved off the webview so the API key never
// enters the JS context and no provider needs to support CORS. Deltas stream back
// to the frontend over a tauri::ipc::Channel; the frontend supplies a requestId it
// can later pass to cancel_ask.
//
// There is no official Anthropic SDK for Rust, so the Messages API is hand-rolled
// over raw SSE here. That is why this file carries the block-accumulation logic the
// TypeScript SDK used to provide: resuming a `pause_turn` requires replaying the
// assistant turn verbatim, so every content block has to be reconstructed from the
// stream as it arrives.
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

use super::search::{self, SearchCache, SearchMode};

const MAX_TOKENS: u32 = 2048;
const WEB_SEARCH_MAX_USES: u32 = 5;
/// Anthropic's server-side tool loop caps at 10 iterations and then returns
/// `stop_reason: "pause_turn"`, expecting the caller to re-send to continue. Bound
/// how many times we'll do that so a pathological search can't loop forever.
const MAX_PAUSE_RESUMES: u32 = 4;

pub(crate) const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
pub(crate) const ANTHROPIC_VERSION: &str = "2023-06-01";
pub(crate) const GEMINI_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";
pub(crate) const OPENAI_BASE: &str = "https://api.openai.com/v1";

// ── Wire types ────────────────────────────────────────────────────────────────

/// Note the absence of an api_key field: the key is read from the OS credential
/// store in-process (see commands::keys), so it never crosses the IPC boundary.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskRequest {
    pub request_id: String,
    pub provider: String,
    pub model: String,
    pub base_url: Option<String>,
    pub system: String,
    pub user: String,
    pub web_search: bool,
}

/// An ask, plus everything resolved server-side: the key from the credential store,
/// and the grounding spec this exact model was probed to accept. Kept separate from
/// the deserialized request so neither can be injected from the frontend.
struct Ask<'a> {
    req: &'a AskRequest,
    api_key: String,
    /// How to ask THIS model for web search, discovered by probing (see
    /// commands::search). Unsupported when the user didn't ask for search, or when
    /// the model turned out not to support it.
    mode: SearchMode,
}

impl Ask<'_> {
    /// The Anthropic tool `type` this model accepted, if search is on.
    fn anthropic_tool(&self) -> Option<&str> {
        match &self.mode {
            SearchMode::AnthropicTool(t) => Some(t),
            _ => None,
        }
    }
    fn gemini_tool(&self) -> Option<&str> {
        match &self.mode {
            SearchMode::GeminiTool(t) => Some(t),
            _ => None,
        }
    }
    fn openai_search(&self) -> bool {
        self.mode == SearchMode::OpenAiOptions
    }
}

/// Events pushed to the frontend mid-stream. Completion and failure ride on the
/// command's own Result instead — the invoke promise resolving is "done", and
/// rejecting carries the error, so neither needs an event of its own.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum AskEvent {
    Text { text: String },
    /// The model is looking something up. Fires once with an empty query when the
    /// lookup starts, then again with the query once it has finished streaming.
    Search { query: String },
}

#[derive(Default)]
pub struct AskState(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl AskState {
    fn register(&self, id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.0.lock().unwrap().insert(id.to_string(), flag.clone());
        flag
    }
    fn finish(&self, id: &str) {
        self.0.lock().unwrap().remove(id);
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn cancel_ask(state: tauri::State<'_, AskState>, request_id: String) {
    let flag = state.0.lock().unwrap().get(&request_id).cloned();
    if let Some(flag) = flag {
        flag.store(true, Ordering::SeqCst);
    }
}

#[tauri::command]
pub async fn ask_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, AskState>,
    cache: tauri::State<'_, SearchCache>,
    req: AskRequest,
    on_event: Channel<AskEvent>,
) -> Result<(), String> {
    let api_key = super::keys::get_api_key(&req.provider);
    if api_key.is_empty() {
        return Err("No API key — add one in Settings to enable AI.".into());
    }
    if req.model.trim().is_empty() {
        return Err("No model set — choose one in Settings.".into());
    }

    // Ask this model how it wants to be asked. Normally a cache hit, since the globe
    // is only visible once the probe has already run. If the capability can't be
    // determined right now, fall back to a plain ungrounded ask rather than failing
    // the whole question — the answer is still useful without search.
    let mode = if req.web_search {
        search::resolve(
            &app,
            &cache,
            &req.provider,
            &req.model,
            req.base_url.as_deref(),
            &api_key,
        )
        .await
        .unwrap_or(SearchMode::Unsupported)
    } else {
        SearchMode::Unsupported
    };
    let ask = Ask { req: &req, api_key, mode };

    let cancel = state.register(&req.request_id);
    let result = dispatch(&ask, &cancel, &on_event).await;
    state.finish(&req.request_id);

    // A cancel is a normal outcome, not an error — the frontend already knows, and
    // a half-read stream shouldn't surface as a failure in the note.
    if cancel.load(Ordering::SeqCst) {
        return Ok(());
    }
    result
}

async fn dispatch(a: &Ask<'_>, cancel: &AtomicBool, ch: &Channel<AskEvent>) -> Result<(), String> {
    match a.req.provider.as_str() {
        "anthropic" => run_anthropic(a, cancel, ch).await,
        // Gemini's OpenAI-compat layer rejects every grounding parameter, so a
        // grounded ask has to go to the native endpoint. An ungrounded Gemini ask
        // stays on the compat path, which keeps one SSE shape for the common case.
        "gemini" if a.gemini_tool().is_some() => run_gemini_native(a, cancel, ch).await,
        _ => run_openai_compat(a, cancel, ch).await,
    }
}

// ── SSE plumbing ──────────────────────────────────────────────────────────────

/// Pulls `data:` payloads out of a text/event-stream response body. Keep-alives and
/// non-data lines are skipped; partial lines are buffered across chunks.
struct Sse {
    inner: std::pin::Pin<Box<dyn futures_util::Stream<Item = reqwest::Result<bytes::Bytes>> + Send>>,
    buf: String,
    ready: std::collections::VecDeque<String>,
}

impl Sse {
    fn new(res: reqwest::Response) -> Self {
        Self {
            inner: Box::pin(res.bytes_stream()),
            buf: String::new(),
            ready: std::collections::VecDeque::new(),
        }
    }

    async fn next(&mut self) -> Result<Option<String>, String> {
        loop {
            if let Some(d) = self.ready.pop_front() {
                return Ok(Some(d));
            }
            let Some(chunk) = self.inner.next().await else {
                return Ok(None);
            };
            let chunk = chunk.map_err(|e| format!("Connection lost: {e}"))?;
            self.buf.push_str(&String::from_utf8_lossy(&chunk));
            drain_data_lines(&mut self.buf, &mut self.ready);
        }
    }
}

/// Moves every complete `data:` line out of `buf` into `ready`, leaving any trailing
/// partial line behind for the next chunk. Split out from Sse so it can be tested
/// without a live response — chunk boundaries land mid-line constantly in practice,
/// and getting this wrong corrupts JSON frames rather than failing loudly.
fn drain_data_lines(buf: &mut String, ready: &mut std::collections::VecDeque<String>) {
    let Some(last_nl) = buf.rfind('\n') else {
        return; // no complete line yet
    };
    let complete = &buf[..last_nl];
    for line in complete.split('\n') {
        if let Some(data) = line.trim().strip_prefix("data:") {
            let data = data.trim();
            if !data.is_empty() {
                ready.push_back(data.to_string());
            }
        }
    }
    *buf = buf[last_nl + 1..].to_string();
}

/// Turns a non-2xx response into a message worth showing the user. Providers bury
/// the human-readable part in different places, so try the common shapes.
pub(crate) async fn http_error(res: reqwest::Response) -> String {
    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    let msg = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| {
            v.pointer("/error/message")
                .or_else(|| v.pointer("/error/error/message"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| body.chars().take(200).collect());
    format!("Request failed ({status}). {msg}")
}

pub(crate) fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))
}

/// Base URL for the OpenAI-compatible endpoints. Shared with the capability probe so
/// a custom endpoint is probed at exactly the address the ask will use.
pub(crate) fn resolve_base(provider: &str, base_url: Option<&str>) -> Result<String, String> {
    Ok(match provider {
        "openai" => OPENAI_BASE.to_string(),
        "gemini" => format!("{GEMINI_BASE}/openai"),
        _ => base_url
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or("No base URL configured — set one in Settings for a custom provider.")?
            .to_string(),
    })
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

/// One assistant turn's worth of streamed content, reassembled block by block so it
/// can be replayed to resume a `pause_turn`.
#[derive(Default)]
struct Turn {
    blocks: Vec<Value>,
    /// index -> accumulated `input_json_delta` fragments (server_tool_use inputs
    /// arrive as partial JSON and are only parseable once the block closes).
    partial_json: HashMap<usize, String>,
    stop_reason: Option<String>,
}

async fn run_anthropic(a: &Ask<'_>, cancel: &AtomicBool, ch: &Channel<AskEvent>) -> Result<(), String> {
    let req = a.req;
    let http = client()?;
    // Exactly the variant this model was probed to accept — no guessing from the id.
    let tools = a.anthropic_tool().map(|variant| {
        json!([{
            "type": variant,
            "name": "web_search",
            "max_uses": WEB_SEARCH_MAX_USES,
        }])
    });

    let mut messages = vec![json!({ "role": "user", "content": req.user })];

    for _ in 0..=MAX_PAUSE_RESUMES {
        if cancel.load(Ordering::SeqCst) {
            return Ok(());
        }

        let mut body = json!({
            "model": req.model,
            "max_tokens": MAX_TOKENS,
            "system": req.system,
            "messages": messages,
            "stream": true,
        });
        if let Some(t) = &tools {
            body["tools"] = t.clone();
        }

        let res = http
            .post(ANTHROPIC_URL)
            .header("x-api-key", &a.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {e}"))?;

        if !res.status().is_success() {
            return Err(http_error(res).await);
        }

        let turn = read_anthropic_turn(res, cancel, ch).await?;
        if cancel.load(Ordering::SeqCst) {
            return Ok(());
        }

        // Anything other than pause_turn ends the exchange.
        if turn.stop_reason.as_deref() != Some("pause_turn") {
            return Ok(());
        }

        // Replay the paused assistant turn verbatim; the server resumes from it. No
        // extra user message — the trailing server_tool_use block is the signal.
        messages.push(json!({ "role": "assistant", "content": turn.blocks }));
    }

    Err(format!(
        "Web search didn't finish after {MAX_PAUSE_RESUMES} continuations — try a narrower question, or turn web search off."
    ))
}

async fn read_anthropic_turn(
    res: reqwest::Response,
    cancel: &AtomicBool,
    ch: &Channel<AskEvent>,
) -> Result<Turn, String> {
    let mut sse = Sse::new(res);
    let mut turn = Turn::default();

    while let Some(data) = sse.next().await? {
        if cancel.load(Ordering::SeqCst) {
            return Ok(turn);
        }
        let Ok(ev) = serde_json::from_str::<Value>(&data) else {
            continue; // keep-alive or partial frame
        };

        match ev["type"].as_str().unwrap_or("") {
            "content_block_start" => {
                let idx = ev["index"].as_u64().unwrap_or(0) as usize;
                let block = ev["content_block"].clone();

                // A failed search comes back as a 200 with an error object inside
                // the result block. Nothing throws, so catch it here or the answer
                // silently proceeds ungrounded.
                if block["type"] == "web_search_tool_result" {
                    if let Some(code) = block.pointer("/content/error_code").and_then(Value::as_str) {
                        return Err(format!("Web search failed ({code})."));
                    }
                }
                if block["type"] == "server_tool_use" {
                    // The query arrives via input_json_delta; announce the lookup now.
                    let _ = ch.send(AskEvent::Search { query: String::new() });
                }
                while turn.blocks.len() <= idx {
                    turn.blocks.push(Value::Null);
                }
                turn.blocks[idx] = block;
            }
            "content_block_delta" => {
                let idx = ev["index"].as_u64().unwrap_or(0) as usize;
                let delta = &ev["delta"];
                match delta["type"].as_str().unwrap_or("") {
                    "text_delta" => {
                        if let Some(t) = delta["text"].as_str() {
                            let _ = ch.send(AskEvent::Text { text: t.to_string() });
                            if let Some(b) = turn.blocks.get_mut(idx) {
                                append_str(&mut b["text"], t);
                            }
                        }
                    }
                    "input_json_delta" => {
                        if let Some(p) = delta["partial_json"].as_str() {
                            turn.partial_json.entry(idx).or_default().push_str(p);
                        }
                    }
                    "citations_delta" => {
                        if let Some(b) = turn.blocks.get_mut(idx) {
                            if !b["citations"].is_array() {
                                b["citations"] = json!([]);
                            }
                            if let Some(arr) = b["citations"].as_array_mut() {
                                arr.push(delta["citation"].clone());
                            }
                        }
                    }
                    _ => {}
                }
            }
            "content_block_stop" => {
                let idx = ev["index"].as_u64().unwrap_or(0) as usize;
                if let Some(raw) = turn.partial_json.remove(&idx) {
                    let parsed = serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| json!({}));
                    if let Some(q) = parsed["query"].as_str() {
                        let _ = ch.send(AskEvent::Search { query: q.to_string() });
                    }
                    if let Some(b) = turn.blocks.get_mut(idx) {
                        b["input"] = parsed;
                    }
                }
            }
            "message_delta" => {
                if let Some(sr) = ev.pointer("/delta/stop_reason").and_then(Value::as_str) {
                    turn.stop_reason = Some(sr.to_string());
                }
            }
            "error" => {
                let msg = ev.pointer("/error/message").and_then(Value::as_str).unwrap_or("Stream error");
                return Err(msg.to_string());
            }
            _ => {}
        }
    }
    Ok(turn)
}

fn append_str(slot: &mut Value, s: &str) {
    match slot.as_str() {
        Some(existing) => *slot = Value::String(format!("{existing}{s}")),
        None => *slot = Value::String(s.to_string()),
    }
}

// ── Gemini (native endpoint, for google_search grounding) ─────────────────────

async fn run_gemini_native(a: &Ask<'_>, cancel: &AtomicBool, ch: &Channel<AskEvent>) -> Result<(), String> {
    let req = a.req;
    let url = format!(
        "{GEMINI_BASE}/models/{}:streamGenerateContent?alt=sse",
        urlencode(&req.model)
    );
    // "google_search" on current models, "google_search_retrieval" on older ones —
    // whichever this model actually accepted when probed.
    let tool = a.gemini_tool().unwrap_or("google_search");
    let mut tool_obj = serde_json::Map::new();
    tool_obj.insert(tool.to_string(), json!({}));

    let body = json!({
        "systemInstruction": { "parts": [{ "text": req.system }] },
        "contents": [{ "role": "user", "parts": [{ "text": req.user }] }],
        "tools": [Value::Object(tool_obj)],
        "generationConfig": { "maxOutputTokens": MAX_TOKENS },
    });

    let res = client()?
        .post(&url)
        .header("x-goog-api-key", &a.api_key)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !res.status().is_success() {
        return Err(http_error(res).await);
    }

    let mut sse = Sse::new(res);
    while let Some(data) = sse.next().await? {
        if cancel.load(Ordering::SeqCst) {
            return Ok(());
        }
        if data == "[DONE]" {
            break;
        }
        let Ok(ev) = serde_json::from_str::<Value>(&data) else {
            continue;
        };
        if let Some(parts) = ev.pointer("/candidates/0/content/parts").and_then(Value::as_array) {
            for p in parts {
                if let Some(t) = p["text"].as_str() {
                    let _ = ch.send(AskEvent::Text { text: t.to_string() });
                }
            }
        }
    }
    Ok(())
}

// ── OpenAI-compatible (OpenAI / Gemini-without-search / custom) ───────────────

async fn run_openai_compat(a: &Ask<'_>, cancel: &AtomicBool, ch: &Channel<AskEvent>) -> Result<(), String> {
    let req = a.req;
    let base = resolve_base(&req.provider, req.base_url.as_deref())?;

    let mut body = json!({
        "model": req.model,
        "max_tokens": MAX_TOKENS,
        "stream": true,
        "messages": [
            { "role": "system", "content": req.system },
            { "role": "user", "content": req.user },
        ],
    });
    // Set only when this model was probed and accepted it — which is how a custom or
    // local OpenAI-compatible endpoint gets search support without being hardcoded.
    if a.openai_search() {
        body["web_search_options"] = json!({});
    }

    let res = client()?
        .post(format!("{}/chat/completions", base.trim_end_matches('/')))
        .header("authorization", format!("Bearer {}", a.api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !res.status().is_success() {
        return Err(http_error(res).await);
    }

    let mut sse = Sse::new(res);
    while let Some(data) = sse.next().await? {
        if cancel.load(Ordering::SeqCst) {
            return Ok(());
        }
        if data == "[DONE]" {
            break;
        }
        let Ok(ev) = serde_json::from_str::<Value>(&data) else {
            continue;
        };
        if let Some(t) = ev.pointer("/choices/0/delta/content").and_then(Value::as_str) {
            let _ = ch.send(AskEvent::Text { text: t.to_string() });
        }
    }
    Ok(())
}

// ── Model listing (Settings panel) ────────────────────────────────────────────

/// Carries the HTTP status through to the frontend so the Settings panel can tell
/// "wrong key" (401/403) apart from network trouble. `status` is 0 when the request
/// never got a response.
#[derive(Serialize)]
pub struct ListError {
    status: u16,
    message: String,
}

impl ListError {
    fn network(e: impl std::fmt::Display) -> Self {
        Self { status: 0, message: format!("{e}") }
    }
}

/// Lists the models the stored key can reach; the Settings panel uses it as a live
/// key check. The key is read from the credential store, so validating a key means
/// saving it first — set_api_key then list_models.
#[tauri::command]
pub async fn list_models(provider: String, base_url: Option<String>) -> Result<Vec<String>, ListError> {
    let api_key = super::keys::get_api_key(&provider);
    if api_key.is_empty() {
        return Ok(vec![]);
    }
    let http = client().map_err(ListError::network)?;

    let req = if provider == "anthropic" {
        http.get("https://api.anthropic.com/v1/models?limit=100")
            .header("x-api-key", &api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
    } else {
        let base = match provider.as_str() {
            "openai" => OPENAI_BASE.to_string(),
            "gemini" => format!("{GEMINI_BASE}/openai"),
            _ => match base_url.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                Some(b) => b.to_string(),
                None => return Ok(vec![]),
            },
        };
        http.get(format!("{}/models", base.trim_end_matches('/')))
            .header("authorization", format!("Bearer {api_key}"))
    };

    let res = req.send().await.map_err(ListError::network)?;
    let status = res.status();
    if !status.is_success() {
        return Err(ListError { status: status.as_u16(), message: http_error(res).await });
    }
    let json: Value = res.json().await.map_err(ListError::network)?;
    // Gemini ids come back as "models/gemini-…"; strip the prefix for use in chat.
    Ok(collect_ids(&json, "models/"))
}

fn collect_ids(json: &Value, strip: &str) -> Vec<String> {
    json["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str())
                .map(|id| id.strip_prefix(strip).unwrap_or(id).to_string())
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    fn drain(chunks: &[&str]) -> Vec<String> {
        let mut buf = String::new();
        let mut ready = VecDeque::new();
        for c in chunks {
            buf.push_str(c);
            drain_data_lines(&mut buf, &mut ready);
        }
        ready.into_iter().collect()
    }

    #[test]
    fn splits_whole_lines() {
        assert_eq!(drain(&["data: {\"a\":1}\ndata: {\"b\":2}\n"]), vec!["{\"a\":1}", "{\"b\":2}"]);
    }

    #[test]
    fn reassembles_frames_split_across_chunks() {
        // The realistic failure: a chunk boundary lands mid-JSON.
        assert_eq!(drain(&["data: {\"te", "xt\":\"hi\"}\n"]), vec!["{\"text\":\"hi\"}"]);
    }

    #[test]
    fn withholds_trailing_partial_line() {
        // A frame with no terminating newline must not be emitted yet.
        assert_eq!(drain(&["data: {\"done\":true}"]), Vec::<String>::new());
    }

    #[test]
    fn skips_event_and_keepalive_lines() {
        assert_eq!(
            drain(&["event: content_block_delta\ndata: {\"x\":1}\n\n: keep-alive\n"]),
            vec!["{\"x\":1}"]
        );
    }

    #[test]
    fn preserves_json_containing_newline_escapes() {
        // An escaped \n inside a JSON string is the two chars \ and n — it must not
        // be mistaken for a frame boundary. Raw strings keep the literal exact.
        let frame = r#"{"text":"a\nb"}"#;
        let input = format!("data: {frame}\n");
        assert_eq!(drain(&[&input]), vec![frame]);
    }

    #[test]
    fn custom_provider_requires_an_explicit_base_url() {
        assert!(resolve_base("custom", None).is_err());
        assert!(resolve_base("custom", Some("   ")).is_err());
        assert_eq!(resolve_base("custom", Some("http://localhost:11434/v1")).unwrap(), "http://localhost:11434/v1");
    }

    #[test]
    fn gemini_compat_base_is_nested_under_the_native_base() {
        // The probe and the ask must hit the same address, so this is shared.
        assert_eq!(resolve_base("gemini", None).unwrap(), format!("{GEMINI_BASE}/openai"));
        assert_eq!(resolve_base("openai", None).unwrap(), OPENAI_BASE);
    }

    #[test]
    fn append_str_accumulates_text_deltas() {
        let mut v = Value::Null;
        append_str(&mut v, "he");
        append_str(&mut v, "llo");
        assert_eq!(v, Value::String("hello".into()));
    }
}
