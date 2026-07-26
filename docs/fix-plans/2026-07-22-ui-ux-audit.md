# UI/UX audit — HyperLink Notes v2 vs ui-ux-pro-max guidelines (2026-07-22)

Method: 7-dimension review against the ui-ux-pro-max guideline DB. Three dimensions ran as
subagents with adversarial verification (forms/feedback, accessibility, interaction states);
the remaining four (typography, layout/spacing, motion, navigation/IA) were audited centrally
after a session limit killed those agents. Every finding below was verified against source.
Desktop context applied throughout: mobile-only rules (44px touch targets etc.) were not
counted against the app.

Legend: **[C]** critical · **[H]** high · **[M]** medium · **[L]** low

## Keyboard reachability (the one systemic theme)

1. **[C] File tree is unreachable by keyboard.** `FileTree.tsx:205` — rows are `<div onClick>`
   with no tabindex/role/key handlers; the only key handling (Escape/Delete) acts on a
   selection only a mouse can create. → role="tree"/"treeitem", roving tabindex,
   Arrow/Enter handling.
2. **[C] Tabs can't be focused or switched by keyboard.** `TabStrip.tsx:176-205` — div tabs,
   no role/tabindex, and no Ctrl+Tab / Ctrl+1..9 shortcuts anywhere. → tablist semantics +
   desktop-standard shortcuts.
3. **[H] Outline rows are mouse-only divs.** `Outline.tsx:40-53`. → make them `<button>`s
   (free focus ring from index.css).
4. **[H] API-key Replace/Remove/Save are `<span onClick>`.** `SettingsPanel.tsx:552-587`,
   styled as inert text (`chrome.css` .settings-show-toggle). → native buttons.
5. **[M] Graph's only entry is an unlabeled canvas click.** `MiniGraph.tsx:45` (Sidebar.tsx:24
   confirms the button was removed by design). → wrap in `<button aria-label="Open graph">`.

## Destructive-action safety

6. **[H] Delete-confirm dialog: document-level Enter fires Delete even with Cancel focused.**
   `DeleteConfirmDialog.tsx:29-33` — keydown reaches document before the focused button's
   click synthesizes; no initialFocus. → remove the document listener, set initialFocus.
7. **[H] Bin's per-row Delete and Empty bin are one-click permanent, no confirm, no undo**
   (`BinPanel.tsx:78,90`, `bin.ts:108-119`) — while the *recoverable* delete gets a full
   dialog. → reuse the danger-toned confirm for permanent deletion.

## Feedback & announcements

8. **[M] Rename failures are silent and duplicates aren't rejected.** `ui.ts:413-417` closes
   the dialog before validating; `vault.ts renameNode` has no sibling-collision check (the
   ui.ts:351 comment promises one). → validate in-dialog, inline error, add the check.
9. **[M] BinPanel claims aria-modal but has no focus trap/initial focus.** `BinPanel.tsx:36`.
   → rebuild on the Ark Dialog primitives DialogShell already uses.
10. **[M] Async errors (Ask bar, key check) are visual-only — never announced.**
    `AskBar.tsx:188`, `SettingsPanel.tsx:615`. No aria-live/role=alert anywhere in src.
    → role="alert" on .ask-error / .settings-hint--error.
11. **[M] Toggle controls don't expose state** (sidebar toggle, find toggle, provider pills)
    while ask-globe correctly uses aria-pressed. → aria-expanded/aria-pressed to match.
12. **[L] Icon-only buttons rely on title alone** (sb-tiles, new-folder; win-btns have
    NOTHING — no title, no aria-label, `WindowControlButton.tsx:29`). → aria-label + title;
    window controls first.

## Interaction-state consistency

13. **[H] The collapsed gold Ask pill — the primary AI CTA — has no hover state** (no
    `.ask-wrap:hover` exists; only the open-state button hovers). The Stop variant kills
    hover via `!important`. → `.ask-wrap:not(.is-open):hover { background: var(--accent-hover) }`.
14. **[M] Cursor language is split**: 11 `cursor: pointer` declarations in chrome.css (all in
    Settings-related controls) vs the app-wide native `cursor: default` convention. → pick one
    (recommend native/VS-Code-style default; keep pointer only on link-styled text).
15. **[M] Press-feedback gaps**: .bin-empty-btn/.settings-close/.bin-close get the press
    *transition* but are missing from the `:active` scale groups (motion.css:252-269);
    .sidebar-toggle/.sb-tile/.vault-tile/.ask-globe have no pressed state at all.
16. **[M] Search-clear controls are ~13-18px and one is a `<span>`** (SidebarSearch clear,
    font-search clear) vs 28px peer controls. → buttons with a 22px hit box.
17. **[L] Two disabled-opacity conventions** (0.25 toolbar vs 0.4 settings). → one token.
18. **[L] Resize handle is a 6px invisible strip** with no resting affordance (VS Code-style;
    tooltip + double-click reset already mitigate). → widen hit strip to 10px, keep visuals.

## Typography / layout / motion (central pass)

19. **[M] Editor measure is ~95 chars/line at full width** (920px border-box − 104px padding
    = 816px at 16px Inter) vs the 60-75ch readability ideal. → try max-width ~760-800px, or
    expose "Readable line length" as a setting (Obsidian precedent).
20. **[M] Type scale drift**: 19 distinct font sizes in chrome.css (8→38px incl. 4 half-pixel
    sizes; 13px×32, 12px×24, 11px×22 dominate). → consolidate to a declared scale
    (11/12/13/14/16 + display sizes), tokenize the outliers.
21. **[M] Z-index is ad-hoc**: 1,5,6,10,20,99,100,200,300×5,400,1000,20000 across chrome.css
    (20000 = hover card). → a five-step token scale (--z-dock/-bar/-overlay/-menu/-toast).
22. **[L] JS-driven motion ignores prefers-reduced-motion** — motion.css's global kill switch
    (line 279) covers CSS only; the graph physics settle animation and the AI typewriter
    still animate. → check matchMedia in GraphCanvas/typewriter init.
23. **[L] Settings opens as a full page; Bin opens as a modal card** — sibling actions in the
    same footer row with different navigation metaphors. Defensible (settings is a place, bin
    is a task), but worth one deliberate decision.
24. **Positive findings worth keeping** (verified, no action): motion tokens 90/150/220ms sit
    inside the 150-300ms guidance band with proper ease-out; the contrast system with floors +
    220k-assertion test is beyond what the guideline DB asks for; Escape closes Settings/Bin/
    dialogs consistently; dialogs (via Ark DialogShell) have proper traps; the 12px gutter
    alignment line now holds from title bar to status bar.

## Suggested order of attack

1. Destructive-action safety: #6, #7 (small, high stakes).
2. Keyboard pass: #1, #2, #3, #4, #12-window-controls (one focused PR; the focus-ring CSS
   already exists).
3. State/feedback polish: #13, #14, #15, #16, #10, #11 (CSS + attributes, one PR).
4. Systemic tokens: #20, #21, #17 (mechanical, low risk).
5. Considered changes: #19 (measure), #5 (graph affordance), #8 (rename validation), #23.
