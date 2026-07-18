// LLM settings. Mirrors the Qt SettingsPanel's provider/apiKey/model fields. The
// requests themselves run in Rust (src-tauri/src/commands/llm.rs), so AI is
// desktop-only — everything here is inert in the plain browser preview.
import { createResource, createSignal } from "solid-js";
import { webSearchCapability } from "../backend/llmApi";
import { hasApiKey, setApiKey, migrateApiKey } from "../backend/keysApi";
import { DEFAULT_MODEL } from "../ai/llmService";
import { isTauri } from "./platform";

export interface Provider {
  key: string;
  label: string;
}
export const PROVIDERS: Provider[] = [
  { key: "anthropic", label: "Anthropic" },
  { key: "gemini", label: "Gemini" },
  { key: "openai", label: "OpenAI" },
  { key: "custom", label: "Custom" },
];

function load(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* unavailable — kept for the session only */
  }
}

const [llmProvider, _setProvider] = createSignal(load("hln.llm.provider", "anthropic"));
const [llmBaseUrl, _setBaseUrl] = createSignal(load("hln.llm.baseUrl", ""));

// The model is stored PER PROVIDER — switching provider swaps to that provider's
// own value. (A legacy single "hln.llm.model" is migrated onto the provider it was
// saved under.) API keys used to work the same way, but now live in the OS
// credential store instead; see keyPresent below.
function loadPerProvider(prefix: string, legacyKey: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PROVIDERS) out[p.key] = load(`${prefix}.${p.key}`, "");
  const legacy = load(legacyKey, "");
  const current = load("hln.llm.provider", "anthropic");
  if (legacy && !out[current]) {
    out[current] = legacy;
    save(`${prefix}.${current}`, legacy);
    try {
      localStorage.removeItem(legacyKey);
    } catch {
      /* ignore */
    }
  }
  return out;
}
const [models, _setModels] = createSignal(loadPerProvider("hln.llm.model", "hln.llm.model"));

// Accessors keep their old shape: they read the CURRENT provider's value.
const llmModel = () => models()[llmProvider()] ?? "";
export { llmProvider, llmModel, llmBaseUrl };

// ── API keys ──────────────────────────────────────────────────────────────────
// Keys are held by Rust in the OS credential store and are never readable from
// here: this tracks PRESENCE only, which is all the UI needs. That is the point of
// the arrangement — nothing in the webview (a rendered note, a compromised
// dependency) has a key to read.
const [keyPresent, setKeyPresent] = createSignal<Record<string, boolean>>({});

/// True when the CURRENT provider has a key stored.
export const llmKeyPresent = () => keyPresent()[llmProvider()] ?? false;

async function refreshKeyPresence(provider: string) {
  const present = await hasApiKey(provider).catch(() => false);
  setKeyPresent((m) => ({ ...m, [provider]: present }));
}

/// Save (or clear, when blank) the current provider's key.
export async function setLlmApiKey(v: string): Promise<void> {
  const p = llmProvider();
  await setApiKey(p, v);
  await refreshKeyPresence(p);
}

/// Adopt any keys the pre-credential-store build left in localStorage, then scrub
/// them — leaving a key sitting in localStorage would defeat the move. A key already
/// in the store wins, so re-running this can't clobber a newer one.
export async function initKeys(): Promise<void> {
  if (!isTauri()) return;
  for (const p of PROVIDERS) {
    const lsKey = `hln.llm.apiKey.${p.key}`;
    const legacy = load(lsKey, "");
    if (legacy.trim()) {
      await migrateApiKey(p.key, legacy).catch(() => false);
      try {
        localStorage.removeItem(lsKey);
      } catch {
        /* ignore */
      }
    }
    await refreshKeyPresence(p.key);
  }
  // The pre-per-provider build kept a single unscoped key here.
  try {
    localStorage.removeItem("hln.llm.apiKey");
  } catch {
    /* ignore */
  }
}

export function setLlmProvider(v: string) {
  _setProvider(v);
  save("hln.llm.provider", v);
  void refreshKeyPresence(v);
}
export function setLlmModel(v: string) {
  const p = llmProvider();
  _setModels((m) => ({ ...m, [p]: v }));
  save(`hln.llm.model.${p}`, v);
}
export function setLlmBaseUrl(v: string) {
  _setBaseUrl(v);
  save("hln.llm.baseUrl", v);
}

// Typewriter speed for streamed AI answers, in characters per second. The model's
// text is revealed at this rate (with a gentle catch-up when the network runs far
// ahead) so answers appear as smooth typing rather than in bursts. Persisted.
export const AI_SPEED_MIN = 10;
export const AI_SPEED_MAX = 140;
const AI_SPEED_DEFAULT = 45;
const [aiTypingSpeed, _setAiTypingSpeed] = createSignal(
  (() => {
    const v = Number(load("hln.ai.typeSpeed", String(AI_SPEED_DEFAULT)));
    return Number.isFinite(v) && v > 0 ? Math.max(AI_SPEED_MIN, Math.min(AI_SPEED_MAX, v)) : AI_SPEED_DEFAULT;
  })(),
);
export { aiTypingSpeed };
export function setAiTypingSpeed(v: number) {
  const n = Math.max(AI_SPEED_MIN, Math.min(AI_SPEED_MAX, Math.round(v)));
  _setAiTypingSpeed(n);
  save("hln.ai.typeSpeed", String(n));
}

// "Use the internet" toggle for the Ask bar — lets the model search the web for
// up-to-date info. Persisted so the choice sticks between sessions; off by default.
const [webSearch, _setWebSearch] = createSignal(load("hln.llm.webSearch", "0") === "1");
export { webSearch };
export function setWebSearch(v: boolean) {
  _setWebSearch(v);
  save("hln.llm.webSearch", v ? "1" : "0");
}

// Whether the CURRENT provider+model can actually ground answers on the web. Rust
// discovers this by probing the provider (no provider exposes it in its models API)
// and caches the answer per model, so this is normally instant after the first ask.
// The blank-model case resolves the same default the request would use, so the gate
// reflects the model that will actually run.
//
// Tri-state on purpose: undefined while probing, false for a definite no, and an
// error when it couldn't be determined (offline, bad key, quota). The globe only
// appears on a definite yes — an unknown must not be shown as a capability.
export type SearchProbe = { state: "checking" } | { state: "yes" } | { state: "no" } | { state: "unknown"; reason: string };

const searchTarget = () =>
  [llmProvider(), llmModel().trim() || DEFAULT_MODEL[llmProvider()] || "", llmBaseUrl(), llmKeyPresent()] as const;

const [searchable, { refetch: recheckWebSearch }] = createResource(
  searchTarget,
  async ([provider, model, baseUrl, hasKey]): Promise<SearchProbe> => {
    // Probing needs a key: the check is a real (tiny) request to the provider.
    if (!isTauri() || !model || !hasKey) return { state: "no" };
    try {
      return (await webSearchCapability(provider, model, baseUrl)) ? { state: "yes" } : { state: "no" };
    } catch (e) {
      return { state: "unknown", reason: typeof e === "string" ? e : String(e) };
    }
  },
);

export { recheckWebSearch };
export const webSearchProbe = (): SearchProbe => searchable() ?? { state: "checking" };
export const webSearchSupported = () => webSearchProbe().state === "yes";

// The effective toggle: on only when the user wants it AND this model can do it.
export const webSearchActive = () => webSearch() && webSearchSupported();

// True when AI features are usable (desktop build, and the current provider has a
// key in the credential store).
export const aiEnabled = () => isTauri() && llmKeyPresent();
