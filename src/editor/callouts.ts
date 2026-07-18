// Obsidian-compatible callout metadata + icon widget. Canonical types, alias
// resolution, per-type accent color and icon, matching Obsidian's documented
// callout set (note/info/tip/warning/…) so vaults render the same here.
// Icon art is Lucide (MIT) path data — the same icon set Obsidian ships.
import { WidgetType } from "@codemirror/view";

export interface CalloutMeta {
  rgb: string; // "R, G, B" — consumed as rgb(var(--callout-rgb)) in the theme
  icon: string; // inner SVG markup (paths only)
}

// Callout accents — the same semantic hues as Obsidian's set, but desaturated
// toward ink so a callout reads as a tinted block of the page rather than a
// web alert box. Each value has to work as BOTH a 9% tint behind text and a
// full-strength title colour, on light and dark pages alike, so they sit in
// the middle of the lightness range.
const BLUE = "96, 138, 212";
const CYAN = "82, 172, 170";
const GREEN = "100, 172, 122";
const ORANGE = "204, 142, 80";
const RED = "212, 100, 100";
const PURPLE = "148, 128, 202";
const GRAY = "146, 146, 146";

// Lucide icon path data (24×24, stroked).
const ICONS = {
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  clipboardList:
    '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  flame:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  helpCircle:
    '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  alertTriangle:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  bug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  quote:
    '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
};

// Alias → meta, mirroring Obsidian's supported types.
const TYPES: Record<string, CalloutMeta> = {
  note: { rgb: BLUE, icon: ICONS.pencil },
  abstract: { rgb: CYAN, icon: ICONS.clipboardList },
  summary: { rgb: CYAN, icon: ICONS.clipboardList },
  tldr: { rgb: CYAN, icon: ICONS.clipboardList },
  info: { rgb: BLUE, icon: ICONS.info },
  todo: { rgb: BLUE, icon: ICONS.checkCircle },
  tip: { rgb: CYAN, icon: ICONS.flame },
  hint: { rgb: CYAN, icon: ICONS.flame },
  important: { rgb: CYAN, icon: ICONS.flame },
  success: { rgb: GREEN, icon: ICONS.check },
  check: { rgb: GREEN, icon: ICONS.check },
  done: { rgb: GREEN, icon: ICONS.check },
  question: { rgb: ORANGE, icon: ICONS.helpCircle },
  help: { rgb: ORANGE, icon: ICONS.helpCircle },
  faq: { rgb: ORANGE, icon: ICONS.helpCircle },
  warning: { rgb: ORANGE, icon: ICONS.alertTriangle },
  caution: { rgb: ORANGE, icon: ICONS.alertTriangle },
  attention: { rgb: ORANGE, icon: ICONS.alertTriangle },
  failure: { rgb: RED, icon: ICONS.x },
  fail: { rgb: RED, icon: ICONS.x },
  missing: { rgb: RED, icon: ICONS.x },
  danger: { rgb: RED, icon: ICONS.zap },
  error: { rgb: RED, icon: ICONS.zap },
  bug: { rgb: RED, icon: ICONS.bug },
  example: { rgb: PURPLE, icon: ICONS.list },
  quote: { rgb: GRAY, icon: ICONS.quote },
  cite: { rgb: GRAY, icon: ICONS.quote },
};

// Unknown types fall back to note styling, as Obsidian does.
export function resolveCallout(type: string): CalloutMeta {
  return TYPES[type.toLowerCase()] ?? TYPES.note;
}

// "[!tip]" with no title text shows the type name as the title.
export function defaultCalloutTitle(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

// Replaces the "[!type] " token: colored icon, plus the default title when the
// author didn't write one, plus a fold chevron when the callout is collapsible
// (`[!type]+` / `[!type]-` — clicking it is handled by calloutFoldClicks).
export class CalloutIconWidget extends WidgetType {
  constructor(
    readonly type: string,
    readonly label: string, // "" when the callout has an explicit title
    readonly foldable = false,
    readonly folded = false,
  ) {
    super();
  }
  eq(o: CalloutIconWidget) {
    return (
      o.type === this.type &&
      o.label === this.label &&
      o.foldable === this.foldable &&
      o.folded === this.folded
    );
  }
  toDOM() {
    const meta = resolveCallout(this.type);
    const wrap = document.createElement("span");
    wrap.className = "cm-callout-icon";
    wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${meta.icon}</svg>`;
    if (this.foldable) {
      const chev = document.createElement("span");
      chev.className = "cm-callout-chevron" + (this.folded ? " cm-callout-chevron--folded" : "");
      chev.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
      chev.title = this.folded ? "Expand" : "Collapse";
      wrap.appendChild(chev);
    }
    if (this.label) {
      const title = document.createElement("span");
      title.className = "cm-callout-title";
      title.textContent = this.label;
      wrap.appendChild(title);
    }
    return wrap;
  }
  ignoreEvent(e: Event) {
    return e.type !== "mousedown"; // let chevron clicks reach calloutFoldClicks
  }
}
