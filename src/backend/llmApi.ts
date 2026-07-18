// Typed wrappers over the Rust LLM commands (see src-tauri/src/commands/llm.rs).
// Transport only — prompt shaping lives in src/ai/llmService.ts. The network calls
// are in Rust so the API key never enters the JS context and no provider needs to
// support CORS, which also makes AI desktop-only: callers must guard on isTauri(),
// these throw in a plain browser.
import { invoke, Channel } from "@tauri-apps/api/core";

/// Streamed back from Rust mid-request. Completion and failure ride on askStream's
/// promise instead, so there is no done/error event to handle here. `search` fires
/// once with an empty query when a lookup starts, then again with the query itself.
export type AskEvent =
  | { type: "text"; text: string }
  | { type: "search"; query: string };

/// No apiKey field: Rust resolves it from the OS credential store in-process, so it
/// never crosses the IPC boundary.
export interface AskParams {
  requestId: string;
  provider: string;
  model: string;
  baseUrl?: string | null;
  system: string;
  user: string;
  webSearch: boolean;
}

/// Resolves when the stream ends; rejects with the provider's message on failure.
/// A cancelled ask resolves normally — cancelAsk() is not an error path.
export function askStream(params: AskParams, onEvent: (e: AskEvent) => void): Promise<void> {
  const channel = new Channel<AskEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("ask_stream", { req: params, onEvent: channel });
}

export const cancelAsk = (requestId: string) => invoke<void>("cancel_ask", { requestId });

/// Whether this exact model can ground answers on the web. Rust answers by probing
/// the provider once and caching the result — no provider exposes this in its models
/// API, so it's discovered rather than assumed. Rejects when it couldn't be
/// determined (offline, bad key, quota), which is NOT the same as "no".
/// Pass refresh to discard the cached answer and re-probe.
export const webSearchCapability = (
  provider: string,
  model: string,
  baseUrl?: string,
  refresh = false,
) => invoke<boolean>("web_search_capability", { provider, model, baseUrl: baseUrl || null, refresh });

/// Rejection shape from listModels. Carries the HTTP status so the Settings panel
/// can tell "wrong key" (401/403) from network trouble; status is 0 with no response.
export interface ModelListError {
  status: number;
  message: string;
}

/// Lists the models the STORED key can reach — doubles as a live key check, so the
/// key must be saved (setApiKey) before calling this.
export const listModels = (provider: string, baseUrl?: string) =>
  invoke<string[]>("list_models", { provider, baseUrl: baseUrl || null });
