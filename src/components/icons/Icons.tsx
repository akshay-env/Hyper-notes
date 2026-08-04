// Line icons recreated from the Qt app's Canvas drawings (same coordinates, round
// caps/joins). stroke="currentColor" so the parent's CSS `color` tints them —
// matching the OG hover behaviour. Stroke weight is no longer per-icon: see
// STROKE_RATIO below.
import type { Component, JSX } from "solid-js";

type IconProps = { size?: number; class?: string; style?: JSX.CSSProperties };

// One visual stroke weight for the whole set, DERIVED from each icon's own viewBox
// instead of passed in per-icon. These are drawn at 11/12/14/16/18/24 units, so a
// single absolute stroke-width would render six different apparent weights —
// normalising against the box is what makes them read as one family. The old
// hand-set values ran from 0.075 to 0.167 of the box, which is why the chevrons
// looked chunky next to the graph icon. 0.11 sits at the heavier end of that
// spread, for the slightly-thicker technical look.
const STROKE_RATIO = 0.11;

const base = (w: number, h: number, children: JSX.Element, p: IconProps): JSX.Element => (
  <svg
    width={p.size ?? w}
    height={p.size ? (p.size * h) / w : h}
    viewBox={`0 0 ${w} ${h}`}
    fill="none"
    stroke="currentColor"
    stroke-width={+(w * STROKE_RATIO).toFixed(2)}
    stroke-linecap="round"
    stroke-linejoin="round"
    class={p.class}
    style={p.style}
  >
    {children}
  </svg>
);

// Minimal folder with a front-flap lip (SidebarHeader new-folder).
export const FolderIcon: Component<IconProps> = (p) =>
  base(18, 16, (
    <>
      <path d="M2.6 13.4 L2.6 5 L6.9 5 L8.5 6.9 L15.4 6.9 L15.4 13.4 Z" />
      <path d="M2.6 9.2 L15.4 9.2" />
    </>
  ), p);

// Magnifier: lens + handle (SidebarSearch).
export const SearchIcon: Component<IconProps> = (p) =>
  base(14, 14, (
    <>
      <circle cx="5.5" cy="5.5" r="4" />
      <line x1="8.6" y1="8.6" x2="12.5" y2="12.5" />
    </>
  ), p);

// Up+down double chevron (vault switcher) — the standard "this is a picker"
// glyph, one chevron pointing each way.
export const VaultChevron: Component<IconProps> = (p) =>
  base(12, 12, (
    <>
      <polyline points="3,4.7 6,1.7 9,4.7" />
      <polyline points="3,7.3 6,10.3 9,7.3" />
    </>
  ), p);

// Right-pointing chevron (file-tree folder toggle; rotate 90° via CSS when open).
export const TreeChevron: Component<IconProps> = (p) =>
  base(12, 12, <polyline points="4,2.5 8.5,6 4,9.5" />, p);

// Trash can (sidebar Bin tile).
export const TrashIcon: Component<IconProps> = (p) =>
  base(14, 14, (
    <>
      <path d="M2 3.5 L12 3.5 M5.5 3.5 L5.5 2 L8.5 2 L8.5 3.5" />
      <path d="M3 3.5 L3.8 12.5 L10.2 12.5 L11 3.5" />
    </>
  ), p);

// Small up/down chevrons for the find bar prev/next (NoteSearchBar.qml, 12x12).
export const ChevronUpSmall: Component<IconProps> = (p) =>
  base(12, 12, <polyline points="2.5,8 6,4.5 9.5,8" />, p);
export const ChevronDownSmall: Component<IconProps> = (p) =>
  base(12, 12, <polyline points="2.5,4.5 6,8 9.5,4.5" />, p);

// Magnifier for the editor-toolbar Find toggle. Drawn on the same 24-unit grid
// and stroke weight as the mode icon beside it so the two read as one icon set.
export const FindIcon: Component<IconProps> = (p) =>
  base(24, 24, (
    <>
      <circle cx="10.5" cy="10.5" r="7" />
      <line x1="15.6" y1="15.6" x2="21" y2="21" />
    </>
  ), p);

// Tiny document glyph for the status-bar word count (StatusBar.qml, 11x13).
export const DocIcon: Component<IconProps> = (p) =>
  base(11, 13, (
    <>
      <path d="M1.5 1.5 L7 1.5 L9.5 4 L9.5 11.5 L1.5 11.5 Z" />
      <path d="M3.3 6 L7.7 6 M3.3 8.3 L7.7 8.3" />
    </>
  ), p);

// 8-tooth gear (sidebar Settings tile).
export const GearIcon: Component<IconProps> = (p) =>
  base(16, 16, (
    <>
      <circle cx="8" cy="8" r="4.1" />
      <circle cx="8" cy="8" r="1.7" />
      <line x1="12.1" y1="8" x2="14.4" y2="8" />
      <line x1="10.899" y1="10.899" x2="12.525" y2="12.525" />
      <line x1="8" y1="12.1" x2="8" y2="14.4" />
      <line x1="5.101" y1="10.899" x2="3.475" y2="12.525" />
      <line x1="3.9" y1="8" x2="1.6" y2="8" />
      <line x1="5.101" y1="5.101" x2="3.475" y2="3.475" />
      <line x1="8" y1="3.9" x2="8" y2="1.6" />
      <line x1="10.899" y1="5.101" x2="12.525" y2="3.475" />
    </>
  ), p);
