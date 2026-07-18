// Color engine: derives the app's FULL token set (every CSS custom property the
// UI reads) from just two inputs — a background colour and an accent colour.
// This is what powers custom themes: the user picks a base + accent, and every
// surface, border, text tier, and graph colour is computed so it stays coherent.
//
// The derivation is tuned so the shipped defaults reproduce the old hand-authored
// palettes almost exactly: deriveTheme("#000000", "#ffe000") ≈ the original dark
// tokens, deriveTheme("#f7f6f2", "#d99a16") ≈ the original light tokens.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function hexToRgb(hex: string): Rgb {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const h2 = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${h2(r)}${h2(g)}${h2(b)}`;
}

// A valid 3/6-digit hex? Guards the color inputs before they touch the DOM.
export function isHex(s: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.trim());
}
export function normalizeHex(s: string): string {
  return rgbToHex(hexToRgb(s));
}

interface Hsl {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
}
function rgbToHsl({ r, g, b }: Rgb): Hsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}
function hslToRgb({ h, s, l }: Hsl): Rgb {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

// Shift a colour's HSL lightness by `delta` (percentage points).
export function shiftL(hex: string, delta: number): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  hsl.l = clamp(hsl.l + delta, 0, 100);
  return rgbToHex(hslToRgb(hsl));
}
// Set a colour's lightness to an absolute value, keeping hue + saturation.
export function setL(hex: string, l: number): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  hsl.l = clamp(l, 0, 100);
  return rgbToHex(hslToRgb(hsl));
}
// Linear RGB blend: t=0 → a, t=1 → b.
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex({
    r: A.r + (B.r - A.r) * t,
    g: A.g + (B.g - A.g) * t,
    b: A.b + (B.b - A.b) * t,
  });
}
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Perceived (relative) luminance, 0 (black) → 1 (white). Used to decide light vs
// dark and to pick readable foreground colours.
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function isLight(hex: string): boolean {
  return luminance(hex) > 0.42;
}
// Black or white — whichever reads better on top of `hex`.
//
// The threshold is 0.179, not the intuitive 0.5: that's the luminance where black and
// white give *equal* WCAG contrast ((L+0.05)/0.05 == 1.05/(L+0.05)). Splitting at 0.5
// hands white to every mid-tone — red-500, green-500, amber-500 — where black would
// read far better, which is why accent-coloured buttons had unreadable labels.
// Because the worst case sits exactly at the crossover, this always yields at least
// 4.58:1 — i.e. a label on an accent fill can never fall below WCAG body text.
const BW_CROSSOVER = 0.179;
export function readable(hex: string): string {
  return luminance(hex) > BW_CROSSOVER ? "#000000" : "#ffffff";
}

// WCAG contrast ratio, 1 (identical) → 21 (black on white).
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// Minimum contrast each token must reach against the surface it's drawn on. These
// are what stop a token from vanishing at an extreme background — without them the
// engine used fixed lightness deltas that silently clip (setL(bg, l+4) on a white
// background returns white, making `surface` identical to `bg`).
//
// Structural tiers sit below WCAG's 3:1 text floor on purpose: a hairline divider at
// 3:1 reads as a hard rule and wrecks the design. They're set at the lowest ratio
// that stays perceptible on any background.
export const FLOOR = {
  surface: 1.06, // panels/cards must separate from the page
  // Hairlines. These were 1.25 / 1.9, which on a light page forced a mid-grey rule
  // (~#aabacd) around every panel and made the UI read as a wireframe. Lowered to the
  // least that still stays perceptible so borders sit back and the content leads —
  // still well clear of the ~1.1 "invisible" range the offsets alone used to produce.
  divider: 1.15, // hairlines between sections
  border: 1.4, // component outlines
  textFaint: 3.0, // WCAG large-text / UI floor
  textMuted: 4.5, // WCAG body text
  textDim: 7.0,
  text: 12.0,
  accentText: 4.5, // accent used AS text or as the caret
  node: 2.5, // graph nodes against the graph background
  // Graph node LABELS are small text, not solid dots — they need the body-text floor,
  // not the dot floor. Tinting them with `node` (2.5:1) is what made titles bleed into
  // the graph background and become unreadable.
  nodeLabel: 4.5,
} as const;

/// Push `hex` away from `backdrop` in lightness until it reaches `target` contrast.
/// Tries `dir` first (+1 lighter, −1 darker) and flips if that pole clips before the
/// target is met — which is exactly what happens on pure white or pure black, where
/// the preferred direction has nowhere left to go. Hue and saturation are preserved,
/// so a tinted background still yields tinted surfaces.
export function ensureContrast(hex: string, backdrop: string, target: number, dir: 1 | -1): string {
  if (contrast(hex, backdrop) >= target) return hex;

  const tryDir = (d: 1 | -1): string | null => {
    const startL = rgbToHsl(hexToRgb(hex)).l;
    // 1-point steps: fine enough to stop as soon as the floor is cleared, so the
    // result stays as close to the requested colour as the floor allows.
    for (let l = startL + d; d > 0 ? l <= 100 : l >= 0; l += d) {
      const candidate = setL(hex, l);
      if (contrast(candidate, backdrop) >= target) return candidate;
    }
    return null;
  };

  const preferred = tryDir(dir);
  if (preferred) return preferred;
  const flipped = tryDir(dir === 1 ? -1 : 1);
  if (flipped) return flipped;
  // Neither pole reaches the target (a mid-grey backdrop can't host a 12:1 token in
  // its own hue). Fall back to the highest-contrast endpoint available.
  const black = "#000000";
  const white = "#ffffff";
  return contrast(black, backdrop) >= contrast(white, backdrop) ? black : white;
}

// The complete token map the app renders with. Keys are CSS custom-property names
// WITHOUT the leading "--" (theme.ts writes them onto :root).
export type TokenMap = Record<string, string>;

// Derive every UI token from a background + accent. Light vs dark is inferred from
// the background's luminance, so an arbitrary custom background still produces a
// coherent, readable palette.
//
// Each token is computed the way it always was — a hand-tuned lightness offset that
// reproduces the shipped palettes — and then passed through a contrast FLOOR. The
// offset decides how it *looks*; the floor guarantees it stays *visible*. On the
// shipped themes almost every token already clears its floor, so they render as
// before; it's the extremes (a pure-white page, a pale accent) where the floor takes
// over and rescues a token that would otherwise collapse onto the background.
export function deriveTheme(bg: string, accent: string): TokenMap {
  const dark = !isLight(bg);
  const fg = dark ? "#ffffff" : "#1b1e26"; // text base for this background
  const t: TokenMap = {};
  t["bg"] = bg;

  // The direction with headroom: on a dark page tokens step lighter, on a light page
  // darker. ensureContrast flips this if the pole clips first.
  const away: 1 | -1 = dark ? 1 : -1;
  const floored = (preferred: string, target: number, dir: 1 | -1 = away) =>
    ensureContrast(preferred, bg, target, dir);

  if (dark) {
    t["surface"] = floored(shiftL(bg, 4), FLOOR.surface);
    t["surface2"] = floored(shiftL(bg, 8), FLOOR.surface);
    t["elevated"] = floored(shiftL(bg, 13), FLOOR.surface);
    t["divider"] = floored(shiftL(bg, 8), FLOOR.divider);
    t["border"] = floored(shiftL(bg, 14), FLOOR.border);
    t["overlay-hover"] = "rgba(255, 255, 255, 0.08)";
  } else {
    // On a light page the PAGE is the paper, so chrome steps DOWN from it into a soft
    // tint — the writing surface stays the brightest thing on screen and the panels
    // recede. (Deriving these upward and letting the contrast floor flip them also
    // "worked", but it walked through pure white first and came back a dead neutral
    // grey, throwing away the page's tint — that flat grey-on-white was the muddy
    // look.) Stepping down directly keeps hue and gives predictable elevation.
    t["surface"] = floored(shiftL(bg, -3), FLOOR.surface);
    t["surface2"] = floored(shiftL(bg, -6), FLOOR.surface);
    t["elevated"] = floored(shiftL(bg, -10), FLOOR.surface);
    t["divider"] = floored(shiftL(bg, -4), FLOOR.divider);
    t["border"] = floored(shiftL(bg, -9), FLOOR.border);
    t["overlay-hover"] = "rgba(0, 0, 0, 0.05)";
  }

  // Text tiers fade from the base foreground toward the background, then each is
  // held at its own readability floor so "faint" never means illegible.
  t["text"] = floored(fg, FLOOR.text);
  t["text-dim"] = floored(mix(fg, bg, 0.22), FLOOR.textDim);
  t["text-muted"] = floored(mix(fg, bg, 0.44), FLOOR.textMuted);
  t["text-faint"] = floored(mix(fg, bg, 0.66), FLOOR.textFaint);

  // Accent + its states. `accent` stays the user's exact colour because it's used as
  // a FILL, where on-accent guarantees the label on top is legible. `accent-text` is
  // the accent drawn ON the page — as text, as a hairline, as the caret — so it
  // carries the text floor. Anything accent-coloured against the background must use
  // accent-text, or a pale accent disappears.
  t["accent"] = accent;
  t["accent-hover"] = dark ? shiftL(accent, 7) : shiftL(accent, -8);
  t["accent-text"] = floored(
    dark ? mix(accent, "#ffffff", 0.18) : shiftL(accent, -18),
    FLOOR.accentText,
  );
  t["on-accent"] = readable(accent);
  t["accent-soft"] = withAlpha(accent, dark ? 0.2 : 0.16);
  t["accent-soft-hi"] = withAlpha(accent, dark ? 0.32 : 0.26);
  t["highlight"] = accent;

  // Danger stays a stable red per mode (not derived — it must always read as an
  // alert regardless of the chosen accent), but still gets floored: the shipped reds
  // are unreadable on a red or near-red background.
  const dangerBase = dark ? "#ff4d4d" : "#d3384a";
  t["danger"] = floored(dangerBase, FLOOR.textMuted);
  t["danger-hover"] = floored(dark ? "#ff6b6b" : "#bb2a3b", FLOOR.textMuted);
  t["danger-soft"] = withAlpha(dangerBase, dark ? 0.16 : 0.1);

  // Graph mirrors the text/accent relationships against the graph background. Node
  // colours carry their own floor: these are small dots and thin edges on a large
  // field, so they need to clear more than a hairline does.
  t["graph-bg"] = bg;
  t["node"] = floored(t["text-muted"], FLOOR.node);
  t["node-neighbor"] = floored(t["text-dim"], FLOOR.node);
  t["node-active"] = floored(accent, FLOOR.node);
  t["node-hi"] = floored(fg, FLOOR.node);
  // Node titles are TEXT on the graph field, so they carry the body-text floor rather
  // than the (much lower) dot floor — otherwise a label drawn in the dot colour bleeds
  // into the background and can't be read.
  t["node-label"] = floored(mix(fg, bg, 0.3), FLOOR.nodeLabel);

  // Elevation. The editorial look wants shadows that are "practically non-existent"
  // — but that rule is written for a white page. A 4%-black shadow on a dark page is
  // literally invisible, so a dark theme would lose every affordance that separates a
  // menu from the surface under it. Elevation is therefore DERIVED per mode: on paper
  // it's the barely-there wash the look calls for and the border does the separating;
  // on a dark page it's a soft deep pool, which is that same intent (recede, don't
  // announce) expressed against a dark backdrop. Three tiers, used consistently:
  // `hair` for resting cards, `lift` for hover, `pop` for portalled overlays.
  t["shadow-hair"] = dark ? "0 1px 2px rgba(0, 0, 0, 0.32)" : "0 1px 2px rgba(0, 0, 0, 0.03)";
  t["shadow-lift"] = dark ? "0 2px 10px rgba(0, 0, 0, 0.42)" : "0 2px 8px rgba(0, 0, 0, 0.04)";
  t["shadow-pop"] = dark ? "0 8px 28px rgba(0, 0, 0, 0.52)" : "0 8px 28px rgba(0, 0, 0, 0.06)";

  return t;
}
