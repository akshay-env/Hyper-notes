// Live theme state. A theme is (mode, accent, background, font, per-element
// overrides). colorEngine derives every base token from mode+accent+bg; we write
// those as inline CSS custom properties on <html>, set --font, and inject a small
// stylesheet for any per-element colour overrides (button/tag/link/heading), so
// the whole app re-themes live.
//
//  • mode: "light" | "dark" | "system"  • accent, bg: any colour
//  • font: one of FONTS  • overrides: give a single element its own colour
//
// Users can save the current theme (all of the above) as a named theme and
// re-apply it. Persisted to localStorage (design-phase equivalent of Qt Settings).
import { createSignal } from "solid-js";
import {
  deriveTheme,
  isHex,
  normalizeHex,
  isLight,
  readable,
  withAlpha,
} from "../theme/colorEngine";

export type ThemeMode = "light" | "dark" | "system";
// Elements that can be given a colour of their own, independent of the accent.
export type ElementKey = "button" | "tag" | "link" | "heading";
export const ELEMENT_KEYS: ElementKey[] = ["button", "tag", "link", "heading"];

export interface ThemeConfig {
  mode: ThemeMode;
  accent: string;
  bg: string | null; // null → use the mode's default background
  font: string; // one of FONTS' ids
  overrides: Partial<Record<ElementKey, string>>;
}
export interface SavedTheme {
  id: string;
  name: string;
  config: ThemeConfig; // bg is always concrete here (frozen at save time)
}

// ── Fonts ────────────────────────────────────────────────────────────────────
export interface FontDef {
  id: string;
  name: string;
  stack: string;
}
// A broad list of fonts. Each is a stack: the named face first, then graceful
// fallbacks, so an uninstalled font still renders in something sensible. On the
// user's system the installed faces render as themselves. The first five ids are
// stable (older saved themes reference them).
export const FONTS: FontDef[] = [
  // Sans-serif
  { id: "system", name: "System UI", stack: '"Segoe UI", system-ui, sans-serif' },
  { id: "inter", name: "Inter", stack: '"Inter", "Segoe UI", system-ui, sans-serif' },
  { id: "arial", name: "Arial", stack: 'Arial, Helvetica, sans-serif' },
  { id: "helvetica", name: "Helvetica Neue", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: "calibri", name: "Calibri", stack: 'Calibri, "Segoe UI", sans-serif' },
  { id: "candara", name: "Candara", stack: 'Candara, "Segoe UI", sans-serif' },
  { id: "corbel", name: "Corbel", stack: 'Corbel, "Segoe UI", sans-serif' },
  { id: "verdana", name: "Verdana", stack: 'Verdana, Geneva, sans-serif' },
  { id: "tahoma", name: "Tahoma", stack: 'Tahoma, Geneva, sans-serif' },
  { id: "trebuchet", name: "Trebuchet MS", stack: '"Trebuchet MS", Tahoma, sans-serif' },
  { id: "franklin", name: "Franklin Gothic", stack: '"Franklin Gothic", "Franklin Gothic Medium", "Segoe UI", sans-serif' },
  { id: "centurygothic", name: "Century Gothic", stack: '"Century Gothic", "Apple SD Gothic Neo", sans-serif' },
  { id: "bahnschrift", name: "Bahnschrift", stack: 'Bahnschrift, "DIN Alternate", sans-serif' },
  { id: "gillsans", name: "Gill Sans", stack: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif' },
  { id: "roboto", name: "Roboto", stack: '"Roboto", "Segoe UI", sans-serif' },
  { id: "opensans", name: "Open Sans", stack: '"Open Sans", "Segoe UI", sans-serif' },
  { id: "lato", name: "Lato", stack: '"Lato", "Segoe UI", sans-serif' },
  { id: "montserrat", name: "Montserrat", stack: '"Montserrat", "Segoe UI", sans-serif' },
  { id: "poppins", name: "Poppins", stack: '"Poppins", "Segoe UI", sans-serif' },
  { id: "sourcesans", name: "Source Sans 3", stack: '"Source Sans 3", "Source Sans Pro", "Segoe UI", sans-serif' },
  { id: "workanssans", name: "Work Sans", stack: '"Work Sans", "Segoe UI", sans-serif' },
  // Rounded
  { id: "rounded", name: "Nunito (Rounded)", stack: '"Nunito", "Segoe UI Variable Text", system-ui, sans-serif' },
  { id: "quicksand", name: "Quicksand", stack: '"Quicksand", "Segoe UI", sans-serif' },
  { id: "comfortaa", name: "Comfortaa", stack: '"Comfortaa", "Segoe UI", sans-serif' },
  // Serif
  { id: "serif", name: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  { id: "times", name: "Times New Roman", stack: '"Times New Roman", Times, serif' },
  { id: "cambria", name: "Cambria", stack: 'Cambria, Georgia, serif' },
  { id: "constantia", name: "Constantia", stack: 'Constantia, Georgia, serif' },
  { id: "garamond", name: "Garamond", stack: 'Garamond, "EB Garamond", "Times New Roman", serif' },
  { id: "palatino", name: "Palatino Linotype", stack: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
  { id: "bookantiqua", name: "Book Antiqua", stack: '"Book Antiqua", Palatino, serif' },
  { id: "sitka", name: "Sitka", stack: 'Sitka, "Sitka Text", Georgia, serif' },
  { id: "merriweather", name: "Merriweather", stack: '"Merriweather", Georgia, serif' },
  { id: "lora", name: "Lora", stack: '"Lora", Georgia, serif' },
  { id: "playfair", name: "Playfair Display", stack: '"Playfair Display", Georgia, serif' },
  { id: "ptserif", name: "PT Serif", stack: '"PT Serif", Georgia, serif' },
  // Monospace
  { id: "mono", name: "JetBrains Mono", stack: '"JetBrains Mono", Consolas, ui-monospace, monospace' },
  { id: "consolas", name: "Consolas", stack: 'Consolas, "Courier New", monospace' },
  { id: "cascadia", name: "Cascadia Code", stack: '"Cascadia Code", "Cascadia Mono", Consolas, monospace' },
  { id: "courier", name: "Courier New", stack: '"Courier New", Courier, monospace' },
  { id: "firacode", name: "Fira Code", stack: '"Fira Code", Consolas, monospace' },
  { id: "sourcecode", name: "Source Code Pro", stack: '"Source Code Pro", Consolas, monospace' },
  { id: "lucidaconsole", name: "Lucida Console", stack: '"Lucida Console", Monaco, monospace' },
  // Display / handwriting
  { id: "impact", name: "Impact", stack: 'Impact, "Franklin Gothic Bold", sans-serif' },
  { id: "rockwell", name: "Rockwell", stack: 'Rockwell, "Roboto Slab", serif' },
  { id: "comicsans", name: "Comic Sans MS", stack: '"Comic Sans MS", "Comic Sans", cursive' },
  { id: "segoeprint", name: "Segoe Print", stack: '"Segoe Print", cursive' },
  { id: "segoescript", name: "Segoe Script", stack: '"Segoe Script", cursive' },
  { id: "inkfree", name: "Ink Free", stack: '"Ink Free", cursive' },
  { id: "gabriola", name: "Gabriola", stack: 'Gabriola, "Segoe Script", cursive' },
  { id: "brushscript", name: "Brush Script", stack: '"Brush Script MT", cursive' },
];
const fontStack = (id: string) => (FONTS.find((f) => f.id === id) ?? FONTS[0]).stack;

// ── The app's two designed themes ────────────────────────────────────────────
// A theme is just a (background, accent) pair — colorEngine derives every surface,
// border, text tier, link, icon and graph colour from it, so switching Mode recolours
// the ENTIRE app coherently. These two pairs are the designed defaults — a warm
// "ink & gold" identity (near-black charcoal / warm paper, both paired with a rich
// amber) instead of the generic cool blue-on-blue-gray the app shipped with:
//
//   Dark  — a warm near-black charcoal (not a cold navy-black, which is what made
//           the old default read as sterile) with a rich amber-gold accent.
//   Light — a warm paper white — the page as the writing surface, not a cold
//           blue-white — with a deeper bronze-gold so it stays readable as text.
const DARK_BG = "#121013";
// The page IS the paper in light mode — a warm eggshell so the derived chrome keeps
// its tint instead of going dead neutral. Panels step down from it.
const LIGHT_BG = "#faf8f4";
const DARK_ACCENT = "#dfa752";
const LIGHT_ACCENT = "#a5710f";
const MODE_ACCENT: Record<"dark" | "light", string> = {
  dark: DARK_ACCENT,
  light: LIGHT_ACCENT,
};

const DEFAULT_CONFIG: ThemeConfig = {
  mode: "dark",
  accent: DARK_ACCENT,
  bg: null,
  font: "system",
  overrides: {},
};

const CONFIG_KEY = "hln.theme.v2";
const SAVED_KEY = "hln.theme.saved";


// ── system-preference tracking ───────────────────────────────────────────────
const mq =
  typeof matchMedia !== "undefined" ? matchMedia("(prefers-color-scheme: dark)") : null;
const systemDark = () => (mq ? mq.matches : true);

function resolveMode(m: ThemeMode): "light" | "dark" {
  return m === "system" ? (systemDark() ? "dark" : "light") : m;
}
function effectiveBg(cfg: ThemeConfig): string {
  if (cfg.bg) return cfg.bg;
  return resolveMode(cfg.mode) === "dark" ? DARK_BG : LIGHT_BG;
}

// ── per-element override CSS ──────────────────────────────────────────────────
// Each element maps to the primary selectors that render it. Overrides win with
// !important so they sit on top of the derived accent, and are undone by simply
// dropping the rule (revert to the accent-derived look).
const ELEMENT_CSS: Record<ElementKey, (c: string) => string> = {
  button: (c) =>
    `.new-note-btn,.new-tab-btn--primary,.dialog-btn--create,.ask-go,.bin-btn--restore{background:${c}!important;border-color:${c}!important;color:${readable(c)}!important;}`,
  tag: (c) => `.cm-tag{color:${c}!important;background-color:${withAlpha(c, 0.16)}!important;}`,
  link: (c) => `.cm-wikilink{color:${c}!important;}`,
  heading: (c) => `.cm-heading{color:${c}!important;}`,
};

let overrideStyleEl: HTMLStyleElement | null = null;
function styleEl(): HTMLStyleElement {
  if (!overrideStyleEl) {
    overrideStyleEl = document.createElement("style");
    overrideStyleEl.id = "hln-theme-overrides";
    document.head.appendChild(overrideStyleEl);
  }
  return overrideStyleEl;
}
function applyOverrides(ov: Partial<Record<ElementKey, string>>): void {
  let css = "";
  for (const k of ELEMENT_KEYS) {
    const c = ov[k];
    if (c) css += ELEMENT_CSS[k](c);
  }
  styleEl().textContent = css;
}

// ── persistence ──────────────────────────────────────────────────────────────
function sanitize(p: unknown): ThemeConfig {
  const o = (p ?? {}) as Partial<ThemeConfig>;
  const mode: ThemeMode =
    o.mode === "light" || o.mode === "dark" || o.mode === "system" ? o.mode : "dark";
  const accent = typeof o.accent === "string" && isHex(o.accent) ? normalizeHex(o.accent) : "#ffe000";
  const bg = typeof o.bg === "string" && isHex(o.bg) ? normalizeHex(o.bg) : null;
  const font = FONTS.some((f) => f.id === o.font) ? (o.font as string) : "system";
  const overrides: Partial<Record<ElementKey, string>> = {};
  if (o.overrides && typeof o.overrides === "object") {
    for (const k of ELEMENT_KEYS) {
      const c = (o.overrides as Record<string, unknown>)[k];
      if (typeof c === "string" && isHex(c)) overrides[k] = normalizeHex(c);
    }
  }
  return { mode, accent, bg, font, overrides };
}
function load(): ThemeConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch {
    /* fall through to default */
  }
  return { ...DEFAULT_CONFIG };
}
function persist(cfg: ThemeConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    /* unavailable — session only */
  }
}
function loadSaved(): SavedTheme[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((t) => t && typeof t.name === "string")
      .map((t) => ({ id: String(t.id), name: t.name, config: sanitize(t.config) }));
  } catch {
    return [];
  }
}
function persistSaved(list: SavedTheme[]): void {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    /* unavailable */
  }
}

// ── DOM application ──────────────────────────────────────────────────────────
function apply(cfg: ThemeConfig): void {
  const tokens = deriveTheme(effectiveBg(cfg), cfg.accent);
  const root = document.documentElement;
  root.removeAttribute("data-theme"); // inline custom vars supersede any preset block
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(`--${k}`, v);
  root.style.colorScheme = resolveMode(cfg.mode);
  root.style.setProperty("--font", fontStack(cfg.font));
  // Headings render in --font-display, which theme.css defaults to an editorial
  // serif. The Font picker tells the user it "applies across the app and your
  // notes", so an explicit choice has to move the display face too — otherwise
  // headings keep the serif and the picker reads as half-applied. The untouched
  // default is the one exception: clearing the property lets theme.css's serif
  // through, so the editorial look is what you get before you touch anything.
  if (cfg.font === DEFAULT_CONFIG.font) root.style.removeProperty("--font-display");
  else root.style.setProperty("--font-display", fontStack(cfg.font));
  applyOverrides(cfg.overrides);
}

// ── reactive state ───────────────────────────────────────────────────────────
const [themeConfig, setThemeConfig] = createSignal<ThemeConfig>(load());
const [themeRevision, setThemeRevision] = createSignal(0);
export { themeConfig, themeRevision };

export const themeMode = () => resolveMode(themeConfig().mode);
export const currentBg = () => effectiveBg(themeConfig());
export const currentAccent = () => themeConfig().accent;
export const currentFont = () => themeConfig().font;
// The current text colour (for editing the heading element, whose default is text).
export const currentText = () => deriveTheme(effectiveBg(themeConfig()), themeConfig().accent).text;
export const elementOverride = (k: ElementKey) => themeConfig().overrides[k];

apply(themeConfig()); // sync the DOM to the persisted choice on load
// Following the system preference must swap the whole designed pair too, not just the
// background — otherwise the accent stays tuned for the mode we just left.
mq?.addEventListener?.("change", () => {
  const cfg = themeConfig();
  if (cfg.mode !== "system") return;
  commit({ ...cfg, accent: MODE_ACCENT[resolveMode("system")] });
});

function commit(next: ThemeConfig): void {
  setThemeConfig(next);
  apply(next);
  setThemeRevision((v) => v + 1);
  persist(next);
}

// Switching mode swaps in that mode's DESIGNED pair — its background and its accent.
// The two modes ARE the app's two themes, so the toggle has to move both; carrying a
// dark-tuned accent onto the light page (or vice versa) is what made a mode switch
// look half-applied.
export function setMode(mode: ThemeMode): void {
  commit({ ...themeConfig(), mode, bg: null, accent: MODE_ACCENT[resolveMode(mode)] });
}
export function setAccent(hex: string): void {
  if (!isHex(hex)) return;
  commit({ ...themeConfig(), accent: normalizeHex(hex) });
}
// A custom background also sets the mode to match its light/dark.
export function setBg(hex: string): void {
  if (!isHex(hex)) return;
  const bg = normalizeHex(hex);
  commit({ ...themeConfig(), bg, mode: isLight(bg) ? "light" : "dark" });
}
export function setFont(id: string): void {
  if (!FONTS.some((f) => f.id === id)) return;
  commit({ ...themeConfig(), font: id });
}
export function setElementOverride(key: ElementKey, hex: string): void {
  if (!isHex(hex)) return;
  commit({ ...themeConfig(), overrides: { ...themeConfig().overrides, [key]: normalizeHex(hex) } });
}
export function clearElementOverride(key: ElementKey): void {
  const overrides = { ...themeConfig().overrides };
  delete overrides[key];
  commit({ ...themeConfig(), overrides });
}
export function resetTheme(): void {
  commit({ ...DEFAULT_CONFIG, overrides: {} });
}
export const isThemeDefault = () => {
  const c = themeConfig();
  return (
    c.mode === DEFAULT_CONFIG.mode &&
    c.accent === DEFAULT_CONFIG.accent &&
    c.bg === null &&
    c.font === "system" &&
    Object.keys(c.overrides).length === 0
  );
};

// ── saved custom themes ──────────────────────────────────────────────────────
const [savedThemes, setSavedThemes] = createSignal<SavedTheme[]>(loadSaved());
export { savedThemes };

export function saveCurrentTheme(name: string): void {
  const cfg = themeConfig();
  const frozen: ThemeConfig = {
    mode: cfg.mode,
    accent: cfg.accent,
    bg: effectiveBg(cfg),
    font: cfg.font,
    overrides: { ...cfg.overrides },
  };
  const item: SavedTheme = { id: `t${Date.now()}`, name: name.trim() || "My theme", config: frozen };
  const next = [...savedThemes(), item];
  setSavedThemes(next);
  persistSaved(next);
}
export function deleteSavedTheme(id: string): void {
  const next = savedThemes().filter((t) => t.id !== id);
  setSavedThemes(next);
  persistSaved(next);
}
export function applySavedTheme(t: SavedTheme): void {
  commit({ ...t.config, overrides: { ...t.config.overrides } });
}

