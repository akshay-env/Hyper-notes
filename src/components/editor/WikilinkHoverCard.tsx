// Floating card shown when hovering a rendered note link in the editor. A
// SINGLE-target link previews that note (title + first lines), like Obsidian. A
// MULTI-target link instead shows its targets as a horizontal strip of chips
// that wraps onto further lines; hovering a chip reveals that note's content
// preview in ONE shared panel below the whole strip (so the pointer can travel
// between chips), and clicking a chip opens that target.
//
// The hover carries ONE unified target list (state/wikilink's HoverTarget):
// each entry is a segment of the link, resolved when the hover was built —
// through its hidden id slot when it has one, by title otherwise. `path` says
// whether the note exists; `canCreate` distinguishes a click-to-create title
// target ("New") from a dead id slot ("Missing", inert — the id names one
// specific deleted note, and creating a fresh one under the label would fork
// the content). The layout switch is a target COUNT, never "which form".
//
// The open/close state machine stays in state/wikilink.ts — the editor's link
// plugin drives it and owns the hover grace period. This component is CONTROLLED
// by that signal; Ark only supplies positioning, which is collision-aware:
// a link near the bottom of the window flips its card above rather than letting
// it run off-screen.
import { type Component, Show, For, createMemo, createEffect, createSignal } from "solid-js";
import { HoverCard } from "@ark-ui/solid/hover-card";
import { Portal } from "solid-js/web";
import {
  wikilinkHover,
  notePreview,
  notePreviewByPath,
  openWikilinkTarget,
  cancelHideWikilink,
  scheduleHideWikilink,
  hideWikilinkNow,
  type HoverTarget,
} from "../../state/wikilink";
import { selectNoteByPath } from "../../state/ui";

// One row of the multi-target list. `open` is null for a NON-actionable row —
// only ever a dead id slot (see the header).
interface CardRow {
  title: string;
  exists: boolean;
  lines: string[];
  // Name shown by the expanded "New note" block when `exists` is false. Empty
  // for a dead id, which has no name to offer and never expands anyway.
  newTitle: string;
  open: (() => void) | null;
}

function toRow(t: HoverTarget): CardRow {
  if (t.path) {
    return {
      ...notePreviewByPath(t.path),
      newTitle: "",
      open: () => selectNoteByPath(t.path),
    };
  }
  if (t.canCreate) {
    return {
      title: t.title,
      exists: false,
      lines: [],
      newTitle: t.title,
      open: () => openWikilinkTarget(t.title),
    };
  }
  // Dead id slot: kept in the list rather than vanishing — a link that quietly
  // shows fewer targets than it has is the thing the model refuses to allow.
  return { title: "Note not found", exists: false, lines: [], newTitle: "", open: null };
}

const WikilinkHoverCard: Component = () => {
  // How many notes the hovered link points at — the only thing the
  // single-vs-list layout switch depends on. Deliberately NOT `rows()`:
  // reading that memo here would build a preview for every target even in the
  // single-target case, where `preview` below builds the only one shown.
  const targetCount = () => wikilinkHover()?.targets.length ?? 0;

  const preview = createMemo(() => {
    const h = wikilinkHover();
    if (!h || h.targets.length !== 1) return null;
    const t = h.targets[0];
    // A resolved target previews that exact note by PATH — its slot already
    // pinned it; resolving its label again could land on a same-named note in
    // another folder.
    return t.path ? notePreviewByPath(t.path) : t.canCreate ? notePreview(t.title) : null;
  });

  // One resolved preview per target for the multi-target list. Memoised so
  // moving the pointer between rows doesn't re-read every linked note's doc.
  const rows = createMemo<CardRow[]>(() => {
    const h = wikilinkHover();
    return h ? h.targets.map(toRow) : [];
  });

  // Which row's preview is expanded. Reset whenever the hovered link changes
  // identity — otherwise a card opened over a different link would start with a
  // stale row expanded. -1 = nothing expanded until the pointer enters a row.
  const [activeIdx, setActiveIdx] = createSignal(-1);
  createEffect(() => {
    wikilinkHover();
    setActiveIdx(-1);
  });

  // The expanded preview is rendered ONCE, below the strip, so it looks its
  // row up by index. The index is deliberately allowed to name nothing: it is
  // -1 until the pointer enters a chip, and `rows` can shrink underneath it
  // when the hover moves to a shorter link before the reset effect runs. Both
  // must read as "nothing expanded", not a crash — hence the plain
  // out-of-range lookup.
  const activeRow = createMemo<CardRow | null>(() => rows()[activeIdx()] ?? null);

  const openFirst = () => {
    const h = wikilinkHover();
    const first = h?.targets[0];
    if (first) {
      if (first.path) selectNoteByPath(first.path);
      else if (first.canCreate) openWikilinkTarget(first.title);
      // dead id → deliberate no-op, matching a click on the link itself
    }
    hideWikilinkNow();
  };

  return (
    <HoverCard.Root
      open={wikilinkHover() !== null}
      onOpenChange={(e) => {
        if (!e.open) hideWikilinkNow();
      }}
      // Driven entirely by the editor's own timers — no second delay here.
      openDelay={0}
      closeDelay={0}
      positioning={{
        placement: "bottom-start",
        gutter: 6,
        // The anchor is a rendered link inside CodeMirror, not a DOM node this
        // component owns, so hand the positioner the link's measured rect.
        getAnchorRect: () => {
          const r = wikilinkHover()?.rect;
          return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
        },
      }}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <HoverCard.Positioner>
          <HoverCard.Content
            class="wikilink-card"
            onMouseEnter={cancelHideWikilink}
            onMouseLeave={scheduleHideWikilink}
          >
            <Show when={wikilinkHover()}>
              {(h) => (
                <Show
                  when={targetCount() > 1}
                  fallback={
                    <Show
                      when={preview()?.exists}
                      fallback={
                        <div class="wikilink-card__new">
                          <span class="wikilink-card__new-label">New note</span>
                          <span class="wikilink-card__new-title">
                            {h().targets[0]?.title ?? ""}
                          </span>
                        </div>
                      }
                    >
                      <div class="wikilink-card__preview" onClick={openFirst}>
                        <div class="wikilink-card__title">{preview()!.title}</div>
                        <div class="wikilink-card__body">
                          <For
                            each={preview()!.lines}
                            fallback={<span class="wikilink-card__empty">Empty note</span>}
                          >
                            {(line) => <div class="wikilink-card__line">{line}</div>}
                          </For>
                        </div>
                      </div>
                    </Show>
                  }
                >
                  <>
                    {/* Every chip lives in this one wrapper: the strip is a
                        flex row, so the expanded preview can no longer be a
                        sibling of the chip that owns it — inline, it would open
                        BETWEEN two chips and split the strip in half. */}
                    <div class="wikilink-card__targets">
                      <For each={rows()}>
                        {(row, i) => (
                          <div
                            class="wikilink-card__target"
                            classList={{ "is-active": activeIdx() === i() }}
                            // A row with no `open` (a dead id) never highlights,
                            // never expands and never responds to a click — the
                            // three together are what "non-actionable" means here.
                            // Its badge is the whole signal, matching the dead-id
                            // row in the right-click menu.
                            onMouseEnter={() => row.open && setActiveIdx(i())}
                            onClick={() => {
                              if (!row.open) return;
                              row.open();
                              hideWikilinkNow();
                            }}
                          >
                            <span class="wikilink-card__target-title">{row.title}</span>
                            <Show when={!row.exists}>
                              <span class="wikilink-card__new-label">
                                {row.open ? "New" : "Missing"}
                              </span>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                    <Show when={activeRow()}>
                      {(row) => (
                        // One panel for whichever chip is hovered. It carries the
                        // divider itself rather than leaving it to the two
                        // branches below, so the "New note" offer gets the same
                        // separator from the strip that a real preview does.
                        <div class="wikilink-card__expanded">
                          <Show
                            when={row().exists}
                            fallback={
                              <div class="wikilink-card__new">
                                <span class="wikilink-card__new-label">New note</span>
                                <span class="wikilink-card__new-title">{row().newTitle}</span>
                              </div>
                            }
                          >
                            <div class="wikilink-card__target-preview">
                              <div class="wikilink-card__body">
                                <For
                                  each={row().lines}
                                  fallback={
                                    <span class="wikilink-card__empty">Empty note</span>
                                  }
                                >
                                  {(line) => <div class="wikilink-card__line">{line}</div>}
                                </For>
                              </div>
                            </div>
                          </Show>
                        </div>
                      )}
                    </Show>
                  </>
                </Show>
              )}
            </Show>
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  );
};

export default WikilinkHoverCard;
