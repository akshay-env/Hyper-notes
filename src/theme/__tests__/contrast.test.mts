// Guarantees the app can't render an invisible token, whatever colours the user
// picks. Every palette entry is tried as a background against every palette entry as
// an accent — plus the pure black/white extremes, which is where the old engine broke
// (setL(bg, l+4) on a white page returned white, so `surface` WAS the background).
//
// Run: npx tsx src/theme/__tests__/contrast.test.mts
import { deriveTheme, contrast, ensureContrast, FLOOR } from "../colorEngine";
import { PALETTE } from "../palette";

let failed = 0;
let checks = 0;

function ok(cond: boolean, msg: () => string) {
  checks++;
  if (!cond) {
    failed++;
    if (failed <= 12) console.log(`  FAIL ${msg()}`);
  }
}

// Every token that is drawn directly ON the page background, with the floor it must
// clear. Keep in sync with deriveTheme.
const AGAINST_BG: Array<[string, number]> = [
  ["surface", FLOOR.surface],
  ["surface2", FLOOR.surface],
  ["elevated", FLOOR.surface],
  ["divider", FLOOR.divider],
  ["border", FLOOR.border],
  ["text", FLOOR.text],
  ["text-dim", FLOOR.textDim],
  ["text-muted", FLOOR.textMuted],
  ["text-faint", FLOOR.textFaint],
  ["accent-text", FLOOR.accentText],
  ["danger", FLOOR.textMuted],
  ["node", FLOOR.node],
  ["node-neighbor", FLOOR.node],
  ["node-active", FLOOR.node],
  ["node-hi", FLOOR.node],
  ["node-label", FLOOR.nodeLabel],
];

const swatches = PALETTE.flatMap((f) => f.shades);
const extremes = ["#ffffff", "#000000", "#808080", "#7f7f7f"];
const backgrounds = [...swatches, ...extremes];
const accents = [...swatches, ...extremes];

// The most contrast ANY colour can reach against this background — black or white,
// whichever is further away. A mid-grey page caps out around 5:1, so a 12:1 text
// floor is physically unreachable there; the engine is required to hit the floor or
// the ceiling, whichever comes first. Asserting the raw floor would be asserting
// that grey isn't grey.
const ceiling = (bg: string) => Math.max(contrast("#000000", bg), contrast("#ffffff", bg));

console.log(`Deriving ${backgrounds.length} backgrounds x ${accents.length} accents…`);

for (const bg of backgrounds) {
  for (const accent of accents) {
    const t = deriveTheme(bg, accent);
    for (const [token, floor] of AGAINST_BG) {
      const v = t[token];
      const need = Math.min(floor, ceiling(bg));
      ok(
        !!v && contrast(v, bg) >= need - 0.001,
        () => `${token} on bg=${bg} accent=${accent}: ${v} is ${contrast(v, bg).toFixed(2)}:1, need ${need.toFixed(2)}`,
      );
    }
    // A button's label must be legible on the accent fill it sits on.
    ok(
      contrast(t["on-accent"], accent) >= 4.5,
      () => `on-accent vs accent=${accent}: ${contrast(t["on-accent"], accent).toFixed(2)}:1`,
    );
  }
}

// ── ensureContrast unit behaviour ────────────────────────────────────────────
// Flips direction when the preferred pole has no headroom.
{
  const out = ensureContrast("#ffffff", "#ffffff", 1.5, 1); // asked to go lighter than white
  ok(contrast(out, "#ffffff") >= 1.5, () => `flip-on-clip: got ${out}`);
}
{
  const out = ensureContrast("#000000", "#000000", 1.5, -1); // asked to go darker than black
  ok(contrast(out, "#000000") >= 1.5, () => `flip-on-clip dark: got ${out}`);
}
// Leaves a colour alone when it already clears the target.
{
  const out = ensureContrast("#000000", "#ffffff", 4.5, -1);
  ok(out === "#000000", () => `should be untouched, got ${out}`);
}
// Preserves hue rather than collapsing to grey.
{
  const out = ensureContrast("#fefce8", "#ffffff", 4.5, -1); // pale yellow on white
  const { r, g, b } = { r: parseInt(out.slice(1, 3), 16), g: parseInt(out.slice(3, 5), 16), b: parseInt(out.slice(5, 7), 16) };
  ok(r > b && g > b, () => `should stay yellow-ish, got ${out}`);
  ok(contrast(out, "#ffffff") >= 4.5, () => `pale accent on white: ${out} is ${contrast(out, "#ffffff").toFixed(2)}:1`);
}

// ── The specific regressions that prompted this ──────────────────────────────
{
  const t = deriveTheme("#ffffff", "#ffe000");
  ok(t["surface"] !== "#ffffff", () => `surface must not equal a white bg (was ${t["surface"]})`);
  ok(contrast(t["border"], "#ffffff") >= FLOOR.border, () => `border on white: ${t["border"]}`);
}
{
  // A pale accent used as the caret must still be visible.
  const t = deriveTheme("#ffffff", "#fefce8");
  ok(
    contrast(t["accent-text"], "#ffffff") >= FLOOR.accentText,
    () => `pale accent-text on white: ${t["accent-text"]} is ${contrast(t["accent-text"], "#ffffff").toFixed(2)}:1`,
  );
}
{
  // The shipped themes must not visibly change: text/accent stay put.
  const dark = deriveTheme("#000000", "#ffe000");
  ok(dark["text"] === "#ffffff", () => `shipped dark text drifted: ${dark["text"]}`);
  ok(dark["accent"] === "#ffe000", () => `accent must be the user's exact colour: ${dark["accent"]}`);
  const light = deriveTheme("#f7f6f2", "#d99a16");
  ok(light["text"] === "#1b1e26", () => `shipped light text drifted: ${light["text"]}`);
}

console.log(`\n${checks - failed}/${checks} passed`);
if (failed) {
  console.log(`${failed} FAILED`);
  throw new Error(`${failed} contrast floor violations`);
}
console.log("no token can go invisible on any palette combination");
