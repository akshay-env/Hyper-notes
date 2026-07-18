# HyperLink Notes — In-Depth QA / UX Test Report

> **UPDATE (2026-07-11, second pass):** After this report, a deep bug-hunt of the
> graph view and editor panel found the app had been damaged by two half-finished
> experiments (a Canvas2D→PIXI renderer migration and a WASM physics engine).
> All of it has been fixed — see **§7 Fix Log** at the bottom. Issues #1, #2, #4
> and #5 below are now RESOLVED; the graph-view rating in §5 described a broken
> renderer (blank canvas + 60 uncaught errors/sec) and no longer applies.

**Tested:** 2026-07-11
**Build:** Vite dev server (`npm run dev`) at http://localhost:1420
**Mode:** Browser build (non-Tauri "Scratch vault", in-memory). Filesystem-backed
Tauri behaviour was validated by code inspection where the browser couldn't exercise it.
**Method:** Driven end-to-end as a user (create/edit/link/graph/search/settings/bin),
plus DOM + source inspection to root-cause each observation.

> Note on screenshots: the visual screenshot tool timed out on every attempt. The
> page appears to never reach "idle" (a Pixi canvas stays mounted even with the
> graph closed — see Issue #5). All verification below was done via the
> accessibility tree, DOM queries, and reading the source.

---

## 1. Executive summary

The app is **stable and surprisingly complete**. Every core flow I exercised works:
note CRUD, wikilinks with auto-create + navigation, live-preview markdown, three
view modes, folders, rename, a real recycle-bin with restore, sidebar + in-note
search, an outline, a Pixi graph view, 8 themes, and a well-organised settings
panel. **Zero console errors** across the entire session, including the graph.

The headline problem is a **note-title design flaw**: every new note is seeded with
a duplicate `# Untitled` H1 that collides with the app's own inline-title widget and
goes **stale after rename**. That one issue leaks into the outline, word count, and
general polish. The other findings are smaller.

**Overall UX rating: 8 / 10** — polished, fast, coherent; held back mainly by the
title duplication and a couple of markdown-fidelity gaps.

---

## 2. What works well (verified)

| Area | Result | Notes |
|---|---|---|
| Vault entry (browser scratch mode) | ✅ | "Continue without a folder" → in-memory vault |
| New note / new folder | ✅ | Folder sorts above notes; parent auto-expands |
| Wikilinks | ✅ | `[[Second Note]]` renders as a link, click **navigates and auto-creates** the target note + tab |
| Live Preview rendering | ✅ | Headings, **bold**, *italic*, wikilinks, callouts (`> [!note]`), inline `$…$` math all render |
| Task lists | ✅ | `- [ ]` / `- [x]` render as checkboxes; clicking a checkbox toggles the underlying `- [ ]` ↔ `- [x]` |
| View modes | ✅ | Live Preview → Source → Reading cycle; Reading is correctly read-only |
| Rename | ✅ | Context menu → dialog → tree + tab + breadcrumb all update |
| Delete → Bin → Restore | ✅ | Delete moves to a real recycle bin ("Vault root · just now") with Restore / Delete / Empty bin |
| Sidebar search | ✅ | Live filter of tree by name; clearable |
| Find in note | ✅ | Highlights matches |
| Outline | ✅ | Lists headings; clicking a heading scrolls the editor to it |
| Settings | ✅ | 4 LLM providers (Anthropic/Gemini/OpenAI/Custom), ~18 graph sliders with per-item "Default" reset, 8 themes |
| Theme switching | ✅ | Instant; persists to `localStorage["hln.theme"]`; sets `data-theme` |
| Graph view | ✅ | Pixi canvas renders, "Replay" control present, **no errors** |
| Tabs | ✅ | Multiple tabs, switch, close (×) all work |
| Stability | ✅ | **No console errors** during the whole test run |

---

## 3. Issues found (ranked)

### 🔴 #1 — New notes seed a duplicate, rename-stale `# Untitled` heading  *(High)*
**Where:** `src/state/ui.ts:171` → `const seedFor = (path) => \`# ${nameFromPath(path)}\n\n\`;`
**What happens:**
- The editor already renders a dedicated **inline-title widget** (`.inline-title`,
  `src/components/editor/Editor.tsx`) derived from the filename.
- On top of that, `createNoteIn` / `createNoteInCurrentTab` seed the note **body**
  with `# <name>`. So a brand-new note has **two titles**: the inline widget *and*
  an H1 in the body. Confirmed: a fresh note's body = `# Untitled` (visible in
  Source mode), word count reads **"2 words"** for an "empty" note.
- **The body H1 does not follow a rename.** After renaming `Untitled → Welcome`:
  inline title = "Welcome", tab = "Welcome", but the body still contains
  `# Untitled`, and the **Outline** therefore lists a stray "Untitled" entry above
  the real headings.

**Impact:** Every note is born with redundant, quickly-stale content; pollutes
outline and word count; confuses "what is the title of this note".
**Fix options:** (a) seed empty (`""`) and rely on the inline title; or
(b) drop the inline-title widget and treat the H1 as the title, keeping it in sync
with the filename on rename. Pick one title model — not both.

### 🟠 #2 — Single-line `$$…$$` block math doesn't render as display math  *(Medium)*
**Where:** `src/editor/livePreview.ts:279` — block detection only fires when a line
`.trim() === "$$"` (i.e. `$$` alone on its own line, content on separate lines).
**What happens:** `$$\int_0^1 x^2 dx$$` on **one line** is not treated as a block.
The inline `$…$` rule partially matches it, producing inline KaTeX with **stray `$`
characters** left in the text. Verified: `.katex` = 2, `.katex-display` = 0; visible
text contains leftover `$`.
**Impact:** Obsidian (the clear reference UX) renders single-line `$$ … $$` as a
centered display block; users pasting notes from there get broken output.
**Fix:** also detect a single line matching `^\s*\$\$(.+?)\$\$\s*$` as a block-math widget.

### 🟡 #3 — Word count includes the title(s)  *(Low–Med)*
An empty new note reports **"2 words"** (inline title + seeded H1). Largely a
symptom of #1, but the counter should exclude the inline title regardless.

### 🟡 #4 — "Ask AI" isn't guarded when no API key is set  *(Low)*
**Where:** `src/state/ai.ts:42 submitAsk()` has no api-key check; `AskBar.tsx` only
sets `disabled={asking()}` and swaps the placeholder to "Add an API key in Settings".
**What happens:** the input stays enabled without a key. `submitAsk` **inserts the
`> question` blockquote into the note first**, then calls `askStream`, which fails →
`askError`. So a keyless ask can mutate the note before erroring.
(The streaming/answer path itself could not be exercised — I won't enter API
credentials — so AI responses are **untested**.)
**Fix:** early-return / disable submit when `!aiEnabled()`; don't write the
blockquote until the request is actually dispatched.

### 🟡 #5 — Page never idles; a Pixi canvas stays mounted with the graph closed  *(Low / Perf — needs confirmation)*
Screenshots consistently time out ("Browser pane may be stuck"), and a `<canvas>`
(the right-panel **MiniGraph**) remains mounted even when Graph View is closed. This
strongly suggests a continuously-running render/physics ticker → constant CPU/GPU
even at rest.
**Fix / verify:** ensure the Pixi ticker and the physics worker are **stopped**
(not just hidden) when the graph/mini-graph isn't visible or has settled.

### ⚪ #6 — Browser build is in-memory only, with no warning  *(Note)*
Only `hln.theme` is persisted; **notes/folders live in memory and are lost on
refresh** in the non-Tauri build. Expected for the mock preview, but a small banner
("changes aren't saved in the browser preview") would prevent surprise data loss.

---

## 4. Couldn't fully test (transparency)
- **AI Ask streaming / answers** — requires a provider API key; not entered.
- **Tauri filesystem path** (real disk vault, folder picker, on-disk bin) — the
  browser build stubs these; validated only by reading `vaultApi.ts` / the
  `isTauri()` guards, which look correct and consistently gated.
- **Graph interactions** (drag nodes, hover labels, click-to-open) — the Pixi
  canvas is opaque to text/DOM tooling and screenshots timed out, so I confirmed it
  *renders and runs without errors* but did not verify pointer interactions.
- **Drag-and-drop** moving notes into folders — not exercisable via the automation used.

---

## 5. Per-aspect UX ratings

| Aspect | Rating | Comment |
|---|---:|---|
| Stability / robustness | 9/10 | No errors anywhere; graceful browser fallback |
| Note editing (markdown live preview) | 8/10 | Great feel; block-math gap (#2) + title dup (#1) |
| Wikilinks / navigation | 9/10 | Auto-create + click-through is excellent |
| File tree / organization | 8/10 | Solid; context menu + folders + sorting all work |
| Rename / delete / bin | 9/10 | Real recycle bin with restore is a highlight |
| Search (sidebar + in-note) | 8/10 | Works well; no visible result-count/next-prev affordance surfaced |
| Outline | 7/10 | Works, but shows the stale "Untitled" from #1 |
| Graph view | 7/10 | Renders cleanly; interactions unverified; idle-cost concern (#5) |
| Settings / theming | 9/10 | Thoughtful, granular, 8 themes, per-slider reset |
| AI integration | —/10 | Not testable without a key; guard gap (#4) noted |
| Onboarding / empty states | 8/10 | Clear vault overlay + "select a note" empty state |
| **Overall** | **8/10** | Polished and coherent; fix #1 and #2 for the biggest lift |

---

## 6. Suggested priority order
1. **#1** — decide on a single title model (kill the seeded H1 or make it rename-aware). Biggest polish win.
2. **#2** — support single-line `$$…$$` block math.
3. **#5** — confirm/stop the idle render loop (perf + battery).
4. **#4** — guard Ask AI when no key; don't mutate the note on failure.
5. **#3 / #6** — word-count excludes title; add an "in-memory preview" hint.

---

## 7. Fix Log (2026-07-11, second pass) — all applied & verified

The graph view and editor panel were broken by two abandoned experiments whose
helper scripts still sit in the project root (`rewrite_graph.cjs`,
`rewrite_graph2.cjs`, `extract.cjs`, `inspect.cjs`, `wat.cjs`, `search.cjs`).

### Graph view — was completely dead, now fully working
1. **`GraphCanvas.ts` render crash** — `rewrite_graph.cjs` (a Canvas2D→PIXI
   migration script) had renamed the render call to `this.updatePixi()` but its
   regex that was supposed to CREATE `updatePixi()` silently failed, so every
   frame threw `TypeError: this.updatePixi is not a function`. The graph and
   mini-graph were permanently blank. **Fixed:** removed the stray pixi imports,
   restored `this.draw()`.
2. **Broken WASM physics layer removed from `physicsWorker.ts`.** It was broken
   five ways: passed a nonexistent `sim.nodeIdToIndex` (TypeError in the worker),
   read `e.source`/`e.target` off edges that only have `sourceIndex`/`targetIndex`,
   treated `fx: NaN` ("free" marker) as "pinned" — NaN-ing every node position on
   the first tick, never decayed `sim.alpha` (⇒ infinite 60 Hz post loop that
   re-woke the crashing render loop ≈ 60 uncaught errors/second), and read
   wrong param names so 4 of 6 physics sliders were dead. **Fixed:** the worker
   now runs the well-tested JS `ForceSimulation` (exact d3-force replica; its 13
   physics tests all pass). SAB fast-path kept with transferable fallback.
3. **COOP/COEP headers removed from `vite.config.ts`** — added for the WASM/SAB
   experiment, `require-corp` blocked every cross-origin image in notes
   (`![](https://…)` → ERR_BLOCKED_BY_RESPONSE). Physics falls back to
   transferable buffers transparently.

### Editor panel
4. **`![[Embeds]]` never rendered** (`obsidianMarkdown.ts`): the parser looked
   back at `pos-1` for the `!`, but the built-in **Image** parser consumes `![`
   first, so `![[x]]` parsed as Image>Link and the Embed node never existed.
   **Fixed:** the wikilink parser now claims the token at the `!` itself.
   Verified: `![[Note]]` renders the embed card (or chip when unresolved).
5. **`$$…$$` math on one line rendered broken** (stray `$`, inline instead of
   display) — only multi-line `$$` fences were detected. **Fixed** in all three
   render paths: `findBlocks` (whole-line block), `scanInline` (mid-line display
   widget, ordered before the single-`$` rule), `renderInline`/`renderMarkdownBlocks`
   (embeds & tables). Verified: whole-line and mid-line `$$…$$` both produce
   `.katex-display`, zero stray dollars; inline `$…$` unchanged.
6. **Duplicate, rename-stale note title** (report issue #1): new notes were
   seeded with a literal `# Untitled` H1 under the inline-title widget.
   **Fixed:** notes start empty (`seedFor` → `""`); the inline title (= filename)
   is the single title. Word count now reads 0 for a new note (fixes issue #3),
   and the Outline no longer shows a phantom stale heading.
7. **Ask AI guarded** (report issue #4): `submitAsk` now returns before touching
   the note when no API key is configured (the bar already shows the
   "Set an API key in Settings →" link).

### Verified end-to-end
- `tsc --noEmit` clean (was 5 errors) · `npm run test:graph` 59/59 pass ·
  `npm run build` succeeds.
- In-browser: graph draws (pixel-verified), node click opens the note, physics
  worker streams and settles, wikilink create/navigate, embed card, checkbox
  toggling, all three view modes, rename/delete/bin — **zero console errors and
  zero uncaught exceptions** across the whole session.
- Note: the browser-pane screenshots timing out during testing was environmental
  (hidden page ⇒ no requestAnimationFrame), not an app defect. Issue #5's
  "never idles" was the WASM alpha-decay bug, fixed by item 2.

### Leftovers you may want to delete (unused, harmless)
- `rewrite_graph.cjs`, `rewrite_graph2.cjs`, `extract.cjs`, `inspect.cjs`,
  `wat.cjs`, `search.cjs` (root) — the experiment scripts that caused this.
- ~~`src/graph/physicsWasm.ts` … `pixi.js` … deps~~ — superseded by §8: the
  WASM engine and PixiJS renderer are now real, shipping features.

---

## 8. Feature build-out (2026-07-11, third pass) — implemented & verified

1. **WASM physics engine (AssemblyScript)** — the d3-force pipeline now lives
   in `assembly/physics.ts`, compiled by `npm run asbuild` (asc → base64 embed
   → `src/graph/physicsWasmBinary.ts`). `WasmForceSimulation` extends the JS
   `ForceSimulation` (alpha/drag lifecycle stays in JS, force pass in WASM);
   the worker runs it off the main thread. Unlike Obsidian's module, the
   collision radius is a real parameter — every physics slider works in WASM.
   13 dedicated tests: exact macro parity with the JS reference (mean edge
   length 261 vs 261), drag pinning, flick velocity, per-slider plumbing.
2. **SharedArrayBuffer zero-copy positions** — dev server now sends
   COOP `same-origin` + COEP `credentialless` (isolation without breaking
   external images, unlike `require-corp`). Verified live:
   `crossOriginIsolated === true`, worker posts one `SharedArrayBuffer` and
   then only 4-byte version bumps (89 `tickShared`, zero `tick` transfers);
   Atomics release/acquire on the version word.
3. **PixiJS WebGL renderer** — `GraphCanvas`'s Canvas2D draw layer replaced
   with a Pixi scene: nodes are tinted/scaled sprites of one circle texture
   (single batched draw call), labels are pooled `PIXI.Text` (glyphs
   rasterized once, transformed on GPU), edges one `Graphics`. Camera pan/zoom
   is a container transform. Canvas fallback registered. Render-on-demand
   loop, culling, hover easing, replay — all preserved. Verified: WebGL
   context owns the canvas, node click / drag / zoom clean, zero errors.
4. **Zoom-in slowdown — root cause + fix**: Canvas2D re-rasterized every dot
   (arc+fill) and every label glyph run per frame at their *screen* size —
   zoomed in, dots and text cover ~zoom× more pixels, so CPU fill cost grew
   with zoom while dragging kept the loop at 60 fps. The GPU renderer (3)
   transforms pre-rasterized textures instead, making frame cost independent
   of zoom level.
5. **Graph layout caching** — already saved to `.hyperlink/graph.json` on
   settle; now also **loaded at vault open** (`loadVault`), so the first graph
   open restores the layout with no shift.
6. **Custom lezer markdown parser** — Wikilinks, Embeds (fixed in §7), Tags,
   and now **Callouts** (`> [!type]±`) tokenize natively in the syntax tree;
   guarded so `[!text](url)` links still parse as links.
7. **Rust `read_file`** — existed but allowed `../` traversal; now
   canonicalizes and rejects paths escaping the vault root.
8. **Multi-select in the file tree** — Ctrl+click toggles, Shift+click selects
   the visible range from the anchor, right-click → "Delete N items", Delete
   key works, Escape/blank-click clears; bulk delete drops nested paths whose
   parent is also selected. Verified end-to-end (3 notes → one confirm → bin).
9. **Scroll hygiene** — `overflow-x: hidden` on the settings card / model list
   / bin list; global `overscroll-behavior: none` kills the end-of-scroll
   rubber-band everywhere.

All verified: `tsc` clean, **72/72 tests**, production build green, zero
console errors / uncaught exceptions across the whole browser session.
