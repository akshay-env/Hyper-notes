// Web-search capability discovery.
//
// No provider tells you whether a given model can ground on the web:
//   • Anthropic's /v1/models capabilities tree has code_execution, citations,
//     thinking, effort… but no web_search entry.
//   • Gemini's Model object has supportedGenerationMethods and no grounding field.
//   • OpenAI's model list is bare ids; web_search_options works only on the
//     *-search-preview models.
//
// So we ask the provider directly instead of maintaining a hand-written model list
// that silently rots every time Google ships a model. For a given provider+model we
// send a throwaway request with the grounding tool attached and `max_tokens: 1`.
// A 2xx means the model accepts the tool; a 400 means it doesn't.
//
// The probe is deliberately cheap. `PROBE_PROMPT` is a greeting no model would
// choose to search for, so attaching the tool validates the request shape without
// actually running a search — which matters on Gemini, where grounded requests draw
// on a separate (small) free-tier quota. The 1-token cap bounds it further.
//
// The subtlety that makes this trustworthy: a 400 on its own does NOT prove the tool
// was the problem — a bad model id or an unsupported parameter looks identical. So on
// a 400 we re-send the SAME request minus the tool as a control. Only if the control
// succeeds do we conclude "this model can't search". If the control also fails, the
// result is inconclusive and is never cached.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

use super::llm::{client, http_error, GEMINI_BASE};

/// How a given model wants its web search asked for — discovered, not assumed.
/// Carries the exact spec so ask_stream can reuse it verbatim.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "spec")]
pub enum SearchMode {
    /// Probed and rejected: this model cannot ground on the web.
    Unsupported,
    /// The Anthropic tool `type` this model accepted (dynamic-filtering variant on
    /// current models, basic variant on older ones).
    AnthropicTool(String),
    /// The Gemini native tool key: "google_search", or "google_search_retrieval" on
    /// older models that predate the rename.
    GeminiTool(String),
    /// An OpenAI-compatible endpoint that accepted `web_search_options: {}`.
    OpenAiOptions,
}

impl SearchMode {
    pub fn supported(&self) -> bool {
        !matches!(self, SearchMode::Unsupported)
    }
}

/// A greeting the model will never want to search for, so the probe validates the
/// request shape without spending grounded-request quota.
const PROBE_PROMPT: &str = "hi";

/// Anthropic tool variants, newest first — the probe walks these in order and keeps
/// the first the model accepts.
const ANTHROPIC_VARIANTS: [&str; 2] = ["web_search_20260209", "web_search_20250305"];
/// Gemini grounding tool keys, current first.
const GEMINI_TOOLS: [&str; 2] = ["google_search", "google_search_retrieval"];

// ── Cache ─────────────────────────────────────────────────────────────────────

/// Probe results keyed by "provider:model", persisted so each model costs one probe
/// ever rather than one per launch. Only conclusive results are stored.
#[derive(Default)]
pub struct SearchCache(Mutex<Option<HashMap<String, SearchMode>>>);

fn cache_key(provider: &str, model: &str) -> String {
    format!("{provider}:{model}")
}

fn cache_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("search-capability.json"))
}

impl SearchCache {
    /// Lazily loads from disk on first use. The guard is never held across an await.
    fn get(&self, app: &tauri::AppHandle, key: &str) -> Option<SearchMode> {
        let mut slot = self.0.lock().unwrap();
        if slot.is_none() {
            *slot = Some(
                cache_file(app)
                    .and_then(|p| std::fs::read_to_string(p).ok())
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
            );
        }
        slot.as_ref().and_then(|m| m.get(key).cloned())
    }

    fn put(&self, app: &tauri::AppHandle, key: String, mode: SearchMode) {
        let snapshot = {
            let mut slot = self.0.lock().unwrap();
            let map = slot.get_or_insert_with(HashMap::new);
            map.insert(key, mode);
            map.clone()
        };
        // Best-effort persistence: a failed write just means we probe again later.
        if let Some(p) = cache_file(app) {
            if let Ok(s) = serde_json::to_string_pretty(&snapshot) {
                let _ = std::fs::write(p, s);
            }
        }
    }

    fn forget(&self, app: &tauri::AppHandle, key: &str) {
        let snapshot = {
            let mut slot = self.0.lock().unwrap();
            let map = slot.get_or_insert_with(HashMap::new);
            map.remove(key);
            map.clone()
        };
        if let Some(p) = cache_file(app) {
            if let Ok(s) = serde_json::to_string_pretty(&snapshot) {
                let _ = std::fs::write(p, s);
            }
        }
    }
}

// ── Probe outcome ─────────────────────────────────────────────────────────────

/// What a single probe request told us.
enum Verdict {
    /// The request was accepted — whatever we attached is supported.
    Accepted,
    /// The request was rejected as malformed. On its own this does not identify the
    /// tool as the culprit; the caller must run a control probe.
    Rejected,
}

/// Classifies a probe response. Auth, quota, and network failures are Err — they say
/// nothing about the model's capabilities and must never be cached as "unsupported".
async fn verdict(res: reqwest::Response) -> Result<Verdict, String> {
    let status = res.status();
    if status.is_success() {
        return Ok(Verdict::Accepted);
    }
    if status == reqwest::StatusCode::BAD_REQUEST {
        return Ok(Verdict::Rejected);
    }
    Err(http_error(res).await)
}

// ── Provider probes ───────────────────────────────────────────────────────────

pub async fn probe(
    provider: &str,
    model: &str,
    base_url: Option<&str>,
    api_key: &str,
) -> Result<SearchMode, String> {
    match provider {
        "anthropic" => probe_anthropic(model, api_key).await,
        "gemini" => probe_gemini(model, api_key).await,
        _ => probe_openai_compat(provider, model, base_url, api_key).await,
    }
}

async fn probe_anthropic(model: &str, api_key: &str) -> Result<SearchMode, String> {
    let send = |tools: Option<Value>| async move {
        let mut body = json!({
            "model": model,
            "max_tokens": 1,
            "messages": [{ "role": "user", "content": PROBE_PROMPT }],
        });
        if let Some(t) = tools {
            body["tools"] = t;
        }
        let res = client()?
            .post(super::llm::ANTHROPIC_URL)
            .header("x-api-key", api_key)
            .header("anthropic-version", super::llm::ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {e}"))?;
        verdict(res).await
    };

    let mut rejected_any = false;
    for variant in ANTHROPIC_VARIANTS {
        let tools = json!([{ "type": variant, "name": "web_search", "max_uses": 1 }]);
        match send(Some(tools)).await? {
            Verdict::Accepted => return Ok(SearchMode::AnthropicTool(variant.to_string())),
            Verdict::Rejected => rejected_any = true,
        }
    }
    if rejected_any {
        control_says_unsupported(send(None).await?)
    } else {
        Ok(SearchMode::Unsupported)
    }
}

async fn probe_gemini(model: &str, api_key: &str) -> Result<SearchMode, String> {
    let url = format!(
        "{GEMINI_BASE}/models/{}:generateContent",
        super::llm::urlencode(model)
    );
    let send = |tools: Option<Value>| {
        let url = url.clone();
        async move {
            let mut body = json!({
                "contents": [{ "role": "user", "parts": [{ "text": PROBE_PROMPT }] }],
                "generationConfig": { "maxOutputTokens": 1 },
            });
            if let Some(t) = tools {
                body["tools"] = t;
            }
            let res = client()?
                .post(&url)
                .header("x-goog-api-key", api_key)
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Network error: {e}"))?;
            verdict(res).await
        }
    };

    let mut rejected_any = false;
    for tool in GEMINI_TOOLS {
        // The tool key is dynamic, so the object is built rather than json!-literal'd.
        let mut obj = serde_json::Map::new();
        obj.insert(tool.to_string(), json!({}));
        match send(Some(json!([Value::Object(obj)]))).await? {
            Verdict::Accepted => return Ok(SearchMode::GeminiTool(tool.to_string())),
            Verdict::Rejected => rejected_any = true,
        }
    }
    if rejected_any {
        control_says_unsupported(send(None).await?)
    } else {
        Ok(SearchMode::Unsupported)
    }
}

async fn probe_openai_compat(
    provider: &str,
    model: &str,
    base_url: Option<&str>,
    api_key: &str,
) -> Result<SearchMode, String> {
    let base = super::llm::resolve_base(provider, base_url)?;
    let url = format!("{}/chat/completions", base.trim_end_matches('/'));
    let send = |with_search: bool| {
        let url = url.clone();
        async move {
            let mut body = json!({
                "model": model,
                "max_tokens": 1,
                "messages": [{ "role": "user", "content": PROBE_PROMPT }],
            });
            if with_search {
                body["web_search_options"] = json!({});
            }
            let res = client()?
                .post(&url)
                .header("authorization", format!("Bearer {api_key}"))
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Network error: {e}"))?;
            verdict(res).await
        }
    };

    match send(true).await? {
        Verdict::Accepted => Ok(SearchMode::OpenAiOptions),
        // Control run: proves the 400 was about web_search_options and not, say, a
        // model that wants max_completion_tokens instead of max_tokens.
        Verdict::Rejected => control_says_unsupported(send(false).await?),
    }
}

/// Interprets the control probe. The control carries no grounding tool, so if the
/// provider still rejects it the request was broken for an unrelated reason and we
/// know nothing about search support.
fn control_says_unsupported(control: Verdict) -> Result<SearchMode, String> {
    match control {
        Verdict::Accepted => Ok(SearchMode::Unsupported),
        Verdict::Rejected => Err(
            "Couldn't determine web-search support: the provider rejected even a plain request for \
             this model. Check the model name."
                .into(),
        ),
    }
}

// ── Resolution + command ──────────────────────────────────────────────────────

/// Cache-first capability lookup. Probes on a miss and caches only conclusive
/// answers, so a flaky network or an exhausted quota can't poison the cache.
pub async fn resolve(
    app: &tauri::AppHandle,
    cache: &SearchCache,
    provider: &str,
    model: &str,
    base_url: Option<&str>,
    api_key: &str,
) -> Result<SearchMode, String> {
    let key = cache_key(provider, model);
    if let Some(hit) = cache.get(app, &key) {
        return Ok(hit);
    }
    let mode = probe(provider, model, base_url, api_key).await?;
    cache.put(app, key, mode.clone());
    Ok(mode)
}

/// True when the given provider+model can ground answers on the web. The Ask bar
/// shows the globe only for a true here, so the toggle can never offer a capability
/// the request wouldn't have. Err means "couldn't tell" (offline, bad key, quota) —
/// the caller should treat that as "don't show the globe", not as "no".
#[tauri::command]
pub async fn web_search_capability(
    app: tauri::AppHandle,
    cache: tauri::State<'_, SearchCache>,
    provider: String,
    model: String,
    base_url: Option<String>,
    refresh: bool,
) -> Result<bool, String> {
    let api_key = super::keys::get_api_key(&provider);
    if api_key.is_empty() || model.trim().is_empty() {
        return Ok(false);
    }
    if refresh {
        cache.forget(&app, &cache_key(&provider, &model));
    }
    let mode = resolve(&app, &cache, &provider, &model, base_url.as_deref(), &api_key).await?;
    Ok(mode.supported())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;

    /// Minimal stand-in for an OpenAI-compatible provider. Answers each request with
    /// the next status in `script`, and records whether the body carried
    /// web_search_options — which is what proves the probe attaches the tool on the
    /// first call and drops it on the control call.
    fn mock_provider(script: Vec<u16>) -> (String, std::sync::mpsc::Receiver<bool>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let (tx, rx) = std::sync::mpsc::channel();

        std::thread::spawn(move || {
            for status in script {
                let Ok((mut stream, _)) = listener.accept() else { return };
                // Read headers to find the body length, then the body itself.
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut len = 0usize;
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 {
                        break;
                    }
                    if let Some(v) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                        len = v.trim().parse().unwrap_or(0);
                    }
                    if line == "\r\n" || line == "\n" {
                        break;
                    }
                }
                let mut body = vec![0u8; len];
                let _ = reader.read_exact(&mut body);
                let body = String::from_utf8_lossy(&body).to_string();
                let _ = tx.send(body.contains("web_search_options"));

                let payload = r#"{"choices":[{"delta":{"content":"hi"}}]}"#;
                let res = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
                    payload.len()
                );
                let _ = stream.write_all(res.as_bytes());
                let _ = stream.flush();
            }
        });
        (base, rx)
    }

    #[tokio::test]
    async fn probe_reports_supported_when_the_endpoint_accepts_the_search_option() {
        let (base, saw) = mock_provider(vec![200]);
        let mode = probe_openai_compat("custom", "local-model", Some(&base), "k").await.unwrap();
        assert_eq!(mode, SearchMode::OpenAiOptions);
        assert!(saw.recv().unwrap(), "the probe must attach web_search_options");
    }

    #[tokio::test]
    async fn probe_reports_unsupported_when_only_the_search_option_is_rejected() {
        // First call (with the tool) 400s, control call (without it) succeeds.
        let (base, saw) = mock_provider(vec![400, 200]);
        let mode = probe_openai_compat("custom", "local-model", Some(&base), "k").await.unwrap();
        assert_eq!(mode, SearchMode::Unsupported);
        assert!(saw.recv().unwrap(), "first call carries the tool");
        assert!(!saw.recv().unwrap(), "control call must drop the tool");
    }

    #[tokio::test]
    async fn probe_is_inconclusive_when_even_a_plain_request_is_rejected() {
        // Both 400 → the model id or a param is wrong, not the search option. This is
        // the case that a naive "400 means unsupported" check would get wrong, hiding
        // the globe forever for a model that can actually search.
        let (base, _saw) = mock_provider(vec![400, 400]);
        let err = probe_openai_compat("custom", "local-model", Some(&base), "k").await;
        assert!(err.is_err(), "must not be cached as unsupported");
    }

    #[tokio::test]
    async fn auth_failure_is_inconclusive_not_unsupported() {
        // A 401 says nothing about capability; caching it as "no" would permanently
        // hide the globe for a model that works once the key is fixed.
        let (base, _saw) = mock_provider(vec![401]);
        assert!(probe_openai_compat("custom", "m", Some(&base), "bad").await.is_err());
    }

    #[test]
    fn unsupported_is_the_only_non_searching_mode() {
        assert!(!SearchMode::Unsupported.supported());
        assert!(SearchMode::AnthropicTool("web_search_20260209".into()).supported());
        assert!(SearchMode::GeminiTool("google_search".into()).supported());
        assert!(SearchMode::OpenAiOptions.supported());
    }

    #[test]
    fn control_acceptance_proves_the_tool_was_the_problem() {
        // Tool probe 400'd, plain request went through → the tool is unsupported.
        assert_eq!(
            control_says_unsupported(Verdict::Accepted).unwrap(),
            SearchMode::Unsupported
        );
    }

    #[test]
    fn control_rejection_is_inconclusive_not_unsupported() {
        // Both 400'd → something else is wrong (bad model id, bad param). Reporting
        // "unsupported" here would silently hide the globe for a working model.
        assert!(control_says_unsupported(Verdict::Rejected).is_err());
    }

    #[test]
    fn mode_survives_a_cache_round_trip() {
        // The cache is JSON on disk; the tag/content shape must round-trip so a
        // discovered Anthropic variant is reused verbatim rather than re-probed.
        let mode = SearchMode::AnthropicTool("web_search_20260209".into());
        let json = serde_json::to_string(&mode).unwrap();
        assert_eq!(serde_json::from_str::<SearchMode>(&json).unwrap(), mode);

        let map: HashMap<String, SearchMode> =
            HashMap::from([("gemini:gemini-2.0-flash".into(), SearchMode::GeminiTool("google_search".into()))]);
        let s = serde_json::to_string(&map).unwrap();
        assert_eq!(serde_json::from_str::<HashMap<String, SearchMode>>(&s).unwrap(), map);
    }

    #[test]
    fn cache_keys_are_scoped_per_provider() {
        // The same model name under a different provider must not collide.
        assert_ne!(cache_key("openai", "gpt-4o"), cache_key("custom", "gpt-4o"));
    }
}
