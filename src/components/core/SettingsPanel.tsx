// In-app settings — a full-window page (not a modal) with a back button and a
// left rail of sections: General, Appearance, AI, Graph. Driven by ui.settingsOpen;
// Esc or Back closes it. The Appearance section is a live theme editor: mode
// (light/dark/system), a custom accent + background (colour picker or hex),
// one-click presets, and saveable custom themes — all applied to the app live.
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createSignal,
  createEffect,
  onCleanup,
  onMount,
} from "solid-js";
import { listModels, type ModelListError } from "../../backend/llmApi";
import { isTauri } from "../../state/platform";
import GraphSettingsSection from "./GraphSettingsSection";
import { closeSettings } from "../../state/ui";
import { vaultName } from "../../state/session";
import {
  type ThemeMode,
  type ElementKey,
  type SavedTheme,
  ELEMENT_KEYS,
  FONTS,
  themeConfig,
  currentAccent,
  currentBg,
  currentFont,
  currentText,
  elementOverride,
  setMode,
  setAccent,
  setBg,
  setFont,
  setElementOverride,
  clearElementOverride,
  savedThemes,
  saveCurrentTheme,
  deleteSavedTheme,
  applySavedTheme,
  resetTheme,
  isThemeDefault,
} from "../../state/theme";
import { PALETTE, SHADE_LABELS } from "../../theme/palette";
import { readable, withAlpha } from "../../theme/colorEngine";
import {
  PROVIDERS,
  llmProvider,
  setLlmProvider,
  llmKeyPresent,
  webSearchProbe,
  recheckWebSearch,
  setLlmApiKey,
  llmModel,
  setLlmModel,
  llmBaseUrl,
  setLlmBaseUrl,
  aiTypingSpeed,
  setAiTypingSpeed,
  AI_SPEED_MIN,
  AI_SPEED_MAX,
} from "../../state/settings";
import { charsThisFrame } from "../../ai/typewriter";

const SECTIONS = ["General", "Appearance", "AI", "Graph"] as const;
type Section = (typeof SECTIONS)[number];

const MODE_LABEL: Record<ThemeMode, string> = { light: "Light", dark: "Dark", system: "System" };

// The colour matrix / picker edits one target at a time: the global accent, the
// background, or a single element that carries its own override.
type Target = "accent" | "bg" | ElementKey;
const TARGET_LABEL: Record<Target, string> = {
  accent: "Accent",
  bg: "Background",
  button: "Button",
  tag: "Tag",
  link: "Link",
  heading: "Heading",
};
const isElementTarget = (t: Target): t is ElementKey => (ELEMENT_KEYS as string[]).includes(t);

// ── Font tab: searchable list (each row previews itself) + sample card ────────
const FontPicker: Component = () => {
  const [query, setQuery] = createSignal("");
  const stack = () => (FONTS.find((f) => f.id === currentFont()) ?? FONTS[0]).stack;
  const filtered = () => {
    const q = query().trim().toLowerCase();
    return q ? FONTS.filter((f) => f.name.toLowerCase().includes(q)) : FONTS;
  };
  return (
    <div class="set-sections">
      <div class="set-group">
        <div class="set-group__title">Font</div>
        <div class="set-group__hint">Applies across the app and your notes. Code stays monospaced.</div>

        <div class="font-search">
          <svg class="font-search__icon" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <circle cx="8.4" cy="8.4" r="5" />
            <line x1="12.1" y1="12.1" x2="16.6" y2="16.6" />
          </svg>
          <input
            class="font-search__input"
            placeholder="Search fonts…"
            spellcheck={false}
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <Show when={query()}>
            <button class="font-search__clear" title="Clear" onClick={() => setQuery("")}>✕</button>
          </Show>
        </div>

        <div class="font-list">
          <For each={filtered()}>
            {(f) => (
              <button
                class="font-row"
                classList={{ sel: currentFont() === f.id }}
                onClick={() => setFont(f.id)}
              >
                <span class="font-row__name" style={{ "font-family": f.stack }}>{f.name}</span>
                <span class="font-row__sample" style={{ "font-family": f.stack }}>Aa Bb Cc 123</span>
              </button>
            )}
          </For>
          <Show when={filtered().length === 0}>
            <div class="font-list__empty">No fonts match “{query()}”.</div>
          </Show>
        </div>
      </div>

      <div class="font-preview" style={{ "font-family": stack() }}>
        <div class="font-preview__h">Heading sample</div>
        <div class="font-preview__b">
          The quick brown fox jumps over the lazy dog. 1234567890 — this is how your notes will read
          in the selected font.
        </div>
      </div>
    </div>
  );
};

// ── Appearance: the live theme editor ────────────────────────────────────────
const AppearanceSection: Component = () => {
  const [tab, setTab] = createSignal<"theme" | "font">("theme");
  const [saveName, setSaveName] = createSignal("");
  const [pendingDelete, setPendingDelete] = createSignal<SavedTheme | null>(null);
  // Which colour the matrix / picker edits: accent, background, or one element.
  const [target, setTarget] = createSignal<Target>("accent");

  const current = () => {
    const t = target();
    if (t === "accent") return currentAccent();
    if (t === "bg") return currentBg();
    return elementOverride(t) ?? (t === "heading" ? currentText() : currentAccent());
  };
  const setCurrent = (hex: string) => {
    const t = target();
    if (t === "accent") return setAccent(hex);
    if (t === "bg") return setBg(hex);
    return setElementOverride(t, hex);
  };
  const swatchSel = (hex: string) => current().toLowerCase() === hex.toLowerCase();

  // Preview element colours: the override if set, else the accent-derived default.
  const btnBg = () => elementOverride("button") ?? "var(--accent)";
  const btnFg = () => {
    const o = elementOverride("button");
    return o ? readable(o) : "var(--on-accent)";
  };
  const tagFg = () => elementOverride("tag") ?? "var(--accent-text)";
  const tagBg = () => {
    const o = elementOverride("tag");
    return o ? withAlpha(o, 0.16) : "var(--accent-soft)";
  };
  const linkFg = () => elementOverride("link") ?? "var(--accent-text)";
  const headFg = () => elementOverride("heading") ?? "var(--text)";

  const confirmDelete = () => {
    const t = pendingDelete();
    if (t) deleteSavedTheme(t.id);
    setPendingDelete(null);
  };

  return (
    <div class="set-sections">
      <div class="app-tabs">
        <button class="app-tab" classList={{ sel: tab() === "theme" }} onClick={() => setTab("theme")}>
          Theme
        </button>
        <button class="app-tab" classList={{ sel: tab() === "font" }} onClick={() => setTab("font")}>
          Font
        </button>
      </div>

      <Show when={tab() === "theme"}>
        <div class="theme-editor__cols">
          <div class="theme-editor__left">
            <div class="set-group">
              <div class="set-group__title">Mode</div>
              <div class="seg">
                <For each={["light", "dark", "system"] as ThemeMode[]}>
                  {(m) => (
                    <button
                      class="seg__opt"
                      classList={{ sel: themeConfig().mode === m }}
                      onClick={() => setMode(m)}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="color-targets">
              <button class="color-target" classList={{ active: target() === "accent" }} onClick={() => setTarget("accent")}>
                <span class="color-target__chip" style={{ background: currentAccent() }} />
                <span class="color-target__label">Accent</span>
              </button>
              <button class="color-target" classList={{ active: target() === "bg" }} onClick={() => setTarget("bg")}>
                <span class="color-target__chip" style={{ background: currentBg() }} />
                <span class="color-target__label">Backgr.</span>
              </button>
            </div>

            <div class="edit-row">
              <span class="edit-row__label">Editing</span>
              <span class="edit-pill">
                {TARGET_LABEL[target()]}
                <Show when={isElementTarget(target()) && elementOverride(target() as ElementKey)}>
                  <button
                    class="edit-pill__reset"
                    title="Reset this element to the accent"
                    onClick={() => clearElementOverride(target() as ElementKey)}
                  >
                    <i class="ti ti-x" aria-hidden="true">✕</i>
                  </button>
                </Show>
              </span>
            </div>

            <div class="color-control">
              <input type="color" class="color-control__well" value={current()} onInput={(e) => setCurrent(e.currentTarget.value)} />
              <input class="color-control__hex" spellcheck={false} value={current()} onChange={(e) => setCurrent(e.currentTarget.value)} />
              <span class="color-control__icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
                </svg>
              </span>
            </div>
            <Show when={target() === "bg" && themeConfig().bg !== null}>
              <button class="text-btn" onClick={() => setMode(themeConfig().mode)}>Use default</button>
            </Show>

            <div class="set-group">
              <div class="preview-head">
                <span class="set-group__title">Preview</span>
              </div>
              <div class="theme-preview2">
                <span class="tp-dot" style={{ background: "var(--accent)" }} />
                <button class="tp-item" classList={{ sel: target() === "heading" }} style={{ color: headFg() }} onClick={() => setTarget("heading")}>Aa</button>
                <button class="tp-item tp-link" classList={{ sel: target() === "link" }} style={{ color: linkFg() }} onClick={() => setTarget("link")}>link</button>
                <button class="tp-item tp-tag" classList={{ sel: target() === "tag" }} style={{ color: tagFg(), background: tagBg() }} onClick={() => setTarget("tag")}>Tag</button>
                <button class="tp-item tp-btn" classList={{ sel: target() === "button" }} style={{ background: btnBg(), color: btnFg() }} onClick={() => setTarget("button")}>Button</button>
              </div>
            </div>
          </div>

          <div class="theme-editor__right">
            <div class="set-group__title">Colours</div>
            <div class="palette">
              <For each={PALETTE}>
                {(fam) => (
                  <For each={fam.shades}>
                    {(hex, i) => (
                      <button
                        class="palette__sw"
                        classList={{ sel: swatchSel(hex) }}
                        style={{ background: hex }}
                        title={`${fam.name}-${SHADE_LABELS[i()]}  ${hex}`}
                        onClick={() => setCurrent(hex)}
                      />
                    )}
                  </For>
                )}
              </For>
            </div>
          </div>
        </div>

        <div class="mythemes-card">
          <span class="mythemes-card__title">My themes</span>
          <input
            class="hex-field save-name"
            placeholder="Name this theme…"
            spellcheck={false}
            value={saveName()}
            onInput={(e) => setSaveName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                saveCurrentTheme(saveName());
                setSaveName("");
              }
            }}
          />
          <button
            class="text-btn text-btn--accent"
            onClick={() => {
              saveCurrentTheme(saveName());
              setSaveName("");
            }}
          >
            Save current
          </button>
          <div class="mythemes-card__list">
            <For each={savedThemes()}>
              {(t) => (
                <div class="preset-card preset-card--saved">
                  <button class="preset-card__open" onClick={() => applySavedTheme(t)} title={t.name}>
                    <span class="preset-card__swatch" style={{ background: t.config.bg ?? "#000" }}>
                      <span class="preset-card__dot" style={{ background: t.config.accent }} />
                    </span>
                    <span class="preset-card__name">{t.name}</span>
                  </button>
                  <button class="preset-card__del" title="Delete theme" onClick={() => setPendingDelete(t)}>
                    ✕
                  </button>
                </div>
              )}
            </For>
          </div>
        </div>

        <button class="set-reset" onClick={resetTheme} disabled={isThemeDefault()}>
          Reset to defaults
        </button>
      </Show>

      <Show when={tab() === "font"}>
        <FontPicker />
      </Show>

      <Show when={pendingDelete()}>
        {(t) => (
          <div class="mini-confirm-scrim" onClick={() => setPendingDelete(null)}>
            <div class="mini-confirm" onClick={(e) => e.stopPropagation()}>
              <div class="mini-confirm__title">Delete “{t().name}”?</div>
              <div class="mini-confirm__body">
                This removes the saved theme. Your current colours won't change.
              </div>
              <div class="mini-confirm__actions">
                <button class="text-btn" onClick={() => setPendingDelete(null)}>Cancel</button>
                <button class="mini-confirm__delete" onClick={confirmDelete}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};

// Answer typing speed: a slider whose live preview types a sample line at exactly
// the chosen chars/sec (using the real typewriter's pacing), restarting whenever the
// value changes — so the number is felt, not guessed. The preview honours the same
// gentle catch-up the real answer uses, but with no backlog it's a steady rate.
const SAMPLE =
  "The answer streams in like this — a calm, steady flow that reads as if it's being written, not pasted.";
const TypingSpeedField: Component = () => {
  const [shown, setShown] = createSignal("");
  let raf = 0;
  let last = 0;
  let carry = 0;
  let idx = 0;
  let restartAt = 0;

  const tick = (now: number) => {
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (idx < SAMPLE.length) {
      const { n, carry: c } = charsThisFrame(aiTypingSpeed(), dt, carry, 0);
      carry = c;
      if (n > 0) {
        idx = Math.min(SAMPLE.length, idx + n);
        setShown(SAMPLE.slice(0, idx));
      }
    } else {
      // Hold the full line briefly, then loop so the preview keeps demonstrating.
      if (!restartAt) restartAt = now + 1400;
      else if (now >= restartAt) {
        idx = 0;
        carry = 0;
        restartAt = 0;
        setShown("");
      }
    }
    raf = requestAnimationFrame(tick);
  };

  // Restart the run from the top whenever the speed changes, so the new rate is
  // visible immediately.
  createEffect(() => {
    aiTypingSpeed();
    idx = 0;
    carry = 0;
    restartAt = 0;
    setShown("");
  });

  onMount(() => {
    last = 0;
    raf = requestAnimationFrame(tick);
  });
  onCleanup(() => cancelAnimationFrame(raf));

  return (
    <div class="settings-field">
      <span class="settings-field__label">Answer typing speed</span>
      <div class="type-speed">
        <input
          class="type-speed__slider"
          type="range"
          min={AI_SPEED_MIN}
          max={AI_SPEED_MAX}
          step={1}
          value={aiTypingSpeed()}
          onInput={(e) => setAiTypingSpeed(Number(e.currentTarget.value))}
        />
        <span class="type-speed__value">{aiTypingSpeed()}<span class="type-speed__unit"> cps</span></span>
      </div>
      <div class="type-speed__preview">
        <span class="type-speed__text">{shown()}</span>
        <span class="type-speed__caret" />
      </div>
      <span class="settings-hint">Characters per second as AI answers stream into a note.</span>
    </div>
  );
};

// ── AI / Language Model ───────────────────────────────────────────────────────
const AiSection: Component = () => {
  // Draft holds what the user is typing. It is never seeded from storage — the key
  // lives in the OS credential store and is deliberately not readable (see
  // src-tauri/src/commands/keys.rs), so the field is write-only: paste to set,
  // Remove to clear. `editing` distinguishes "no key yet" from "replacing a key".
  const [draft, setDraft] = createSignal("");
  const [editing, setEditing] = createSignal(false);
  const [models, setModels] = createSignal<string[]>([]);
  const [keyError, setKeyError] = createSignal("");
  const [keyChecking, setKeyChecking] = createSignal(false);
  const [keyValid, setKeyValid] = createSignal(false);

  // Verify whatever key is currently STORED for this provider — listModels reads it
  // from the credential store, so this re-runs on save/remove via llmKeyPresent().
  createEffect(() => {
    const provider = llmProvider();
    const present = llmKeyPresent();
    const base = llmBaseUrl();
    setModels([]);
    setKeyError("");
    setKeyValid(false);
    setKeyChecking(false);
    if (!present || !isTauri()) return;
    const providerLabel = PROVIDERS.find((p) => p.key === provider)?.label ?? provider;
    // The Rust command can't be aborted mid-flight; instead drop a result that
    // arrives after the provider/base has already moved on.
    let stale = false;
    setKeyChecking(true);
    listModels(provider, base)
      .then((ids) => {
        if (stale) return;
        setModels(ids);
        setKeyValid(true);
      })
      .catch((e: ModelListError) => {
        if (stale) return;
        setKeyError(
          e?.status === 401 || e?.status === 403
            ? `This key was rejected by ${providerLabel} — it may be for a different provider, mistyped, or revoked.`
            : `Couldn't verify the key with ${providerLabel} (${e?.message ?? "network error"}).`,
        );
      })
      .finally(() => {
        if (!stale) setKeyChecking(false);
      });
    onCleanup(() => {
      stale = true;
    });
  });

  // Switching provider abandons any half-typed key rather than carrying it across.
  createEffect(() => {
    llmProvider();
    setDraft("");
    setEditing(false);
  });

  const saveKey = async () => {
    const v = draft().trim();
    if (!v) return;
    setDraft("");
    setEditing(false);
    await setLlmApiKey(v);
  };
  const removeKey = async () => {
    setDraft("");
    setEditing(false);
    await setLlmApiKey("");
  };

  const modelPlaceholder = () =>
    llmProvider() === "anthropic"
      ? "e.g. claude-opus-4-8"
      : llmProvider() === "gemini"
        ? "e.g. gemini-2.0-flash"
        : "e.g. gpt-4o";

  return (
    <div class="set-sections">
      <div class="settings-field">
        <span class="settings-field__label">Provider</span>
        <div class="provider-flow">
          <For each={PROVIDERS}>
            {(p) => (
              <button
                class={`provider-pill ${llmProvider() === p.key ? "selected" : ""}`}
                onClick={() => setLlmProvider(p.key)}
              >
                {p.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="settings-field">
        <span class="settings-field__label">API key</span>
        {/* Write-only: a saved key can't be displayed back, because nothing in the
            webview can read it. Saved → status + Replace/Remove; otherwise → input. */}
        <Show
          when={!llmKeyPresent() || editing()}
          fallback={
            <div class="settings-input-box">
              <span class="settings-input settings-input--mono settings-input--static">
                •••••••••••••••• saved
              </span>
              <span class="settings-show-toggle" onClick={() => setEditing(true)}>
                Replace
              </span>
              <span class="settings-show-toggle" onClick={() => void removeKey()}>
                Remove
              </span>
            </div>
          }
        >
          <div class="settings-input-box">
            <input
              class="settings-input settings-input--mono"
              type="password"
              placeholder="Paste your API key…"
              spellcheck={false}
              autofocus={editing()}
              value={draft()}
              onInput={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveKey();
                } else if (e.key === "Escape" && editing()) {
                  e.preventDefault();
                  setDraft("");
                  setEditing(false);
                }
              }}
            />
            <span
              class="settings-show-toggle"
              classList={{ "is-disabled": !draft().trim() }}
              onClick={() => void saveKey()}
            >
              Save
            </span>
          </div>
        </Show>
        <Show
          when={keyError()}
          fallback={
            <Show
              when={keyChecking()}
              fallback={
                <Show
                  when={keyValid()}
                  fallback={
                    <span class="settings-hint">
                      Held in this device's credential store, separately for each provider — the app
                      can save it but never read it back. Remove it to disable AI features.
                    </span>
                  }
                >
                  <span class="settings-hint settings-hint--ok">
                    ✓ Key verified — {models().length} models available.
                  </span>
                </Show>
              }
            >
              <span class="settings-hint">Checking key…</span>
            </Show>
          }
        >
          <span class="settings-hint settings-hint--error">⚠ {keyError()}</span>
        </Show>
      </div>

      <div class="settings-field">
        <span class="settings-field__label">Model</span>
        <div class="settings-input-box">
          <input
            class="settings-input settings-input--mono"
            placeholder={modelPlaceholder()}
            spellcheck={false}
            value={llmModel()}
            onInput={(e) => setLlmModel(e.currentTarget.value)}
          />
        </div>
        <Show when={models().length > 0}>
          <div class="model-flow">
            <For each={models()}>
              {(id) => (
                <button
                  class={`model-chip ${llmModel() === id ? "selected" : ""}`}
                  onClick={() => setLlmModel(id)}
                >
                  {id}
                </button>
              )}
            </For>
          </div>
        </Show>
        {/* Web-search support isn't published by any provider's models API, so it's
            discovered by probing this model once and cached. Surfacing it here
            explains why the Ask bar's globe is or isn't there. */}
        <Show when={llmKeyPresent()}>
          <Switch>
            <Match when={webSearchProbe().state === "checking"}>
              <span class="settings-hint">Checking whether this model can search the web…</span>
            </Match>
            <Match when={webSearchProbe().state === "yes"}>
              <span class="settings-hint settings-hint--ok">
                ✓ This model can search the web — the globe in the Ask bar turns it on and off.
              </span>
            </Match>
            <Match when={webSearchProbe().state === "no"}>
              <span class="settings-hint">
                This model can't search the web, so the Ask bar hides the globe. Pick a model that
                supports grounding to enable it.
              </span>
            </Match>
            <Match when={webSearchProbe().state === "unknown"}>
              <span class="settings-hint settings-hint--error">
                ⚠ Couldn't check web-search support.{" "}
                <button class="ask-link" onClick={() => void recheckWebSearch()}>
                  Retry
                </button>
              </span>
            </Match>
          </Switch>
        </Show>
      </div>

      <Show when={llmProvider() === "custom"}>
        <div class="settings-field">
          <span class="settings-field__label">Base URL</span>
          <div class="settings-input-box">
            <input
              class="settings-input settings-input--mono"
              placeholder="e.g. https://my-host/v1"
              spellcheck={false}
              value={llmBaseUrl()}
              onInput={(e) => setLlmBaseUrl(e.currentTarget.value)}
            />
          </div>
          <span class="settings-hint">OpenAI-compatible /chat/completions endpoint.</span>
        </div>
      </Show>

      <div class="settings-divider" />
      <TypingSpeedField />
    </div>
  );
};

// ── General ───────────────────────────────────────────────────────────────────
const GeneralSection: Component = () => (
  <div class="set-sections">
    <div class="set-group">
      <div class="set-group__title">Vault</div>
      <div class="set-group__hint">{vaultName() || "No vault open"}</div>
    </div>
    <div class="set-group">
      <div class="set-group__title">About</div>
      <div class="set-group__hint">HyperLink Notes — a local-first, linked notebook.</div>
    </div>
  </div>
);

const SettingsPanel: Component<{ closing?: () => boolean }> = (props) => {
  const [section, setSection] = createSignal<Section>("Appearance");

  const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSettings();
  onMount(() => document.addEventListener("keydown", onKey));
  onCleanup(() => document.removeEventListener("keydown", onKey));

  return (
    <div class="settings-page" classList={{ "is-closing": props.closing?.() }}>
      <div class="settings-page__header">
        <button class="settings-back" onClick={closeSettings} title="Back">
          <span class="settings-back__arrow">←</span>
          <span>Back</span>
        </button>
        <span class="settings-page__title">Settings</span>
      </div>

      <div class="settings-page__body">
        <nav class="settings-nav">
          <For each={SECTIONS}>
            {(s) => (
              <button
                class="settings-nav__item"
                classList={{ sel: section() === s }}
                onClick={() => setSection(s)}
              >
                {s === "AI" ? "Language Model" : s}
              </button>
            )}
          </For>
        </nav>

        <div class="settings-content">
          <div class="settings-content__inner">
            <h2 class="settings-content__heading">
              {section() === "AI" ? "Language Model" : section()}
            </h2>
            <Show when={section() === "General"}>
              <GeneralSection />
            </Show>
            <Show when={section() === "Appearance"}>
              <AppearanceSection />
            </Show>
            <Show when={section() === "AI"}>
              <AiSection />
            </Show>
            <Show when={section() === "Graph"}>
              <GraphSettingsSection />
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
