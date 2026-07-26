// Floating card shown when hovering a rendered [[wikilink]] in the editor. A
// SINGLE-target link previews that note (title + first lines), like Obsidian. A
// MULTI-target link [[A|B|C]] instead lists each target's note title as a row;
// hovering a row reveals that note's content preview inline beneath it (so the
// pointer can travel between rows), and clicking a row opens that target.
//
// The open/close state machine stays in state/wikilink.ts — the editor's link
// plugin drives it and owns the hover grace period. This component is CONTROLLED
// by that signal; Ark only supplies positioning, which is now collision-aware:
// a link near the bottom of the window flips its card above rather than letting
// it run off-screen (the old hand-rolled clamp could only push it down).
import { type Component, Show, For, createMemo, createEffect, createSignal } from "solid-js";
import { HoverCard } from "@ark-ui/solid/hover-card";
import { Portal } from "solid-js/web";
import {
  wikilinkHover,
  notePreview,
  openWikilinkTarget,
  cancelHideWikilink,
  scheduleHideWikilink,
  hideWikilinkNow,
} from "../../state/wikilink";

const WikilinkHoverCard: Component = () => {
  const preview = createMemo(() => {
    const h = wikilinkHover();
    return h && h.targets.length ? notePreview(h.targets[0]) : null;
  });

  // One resolved preview per target for the multi-target list. Memoised so moving
  // the pointer between rows doesn't re-read every linked note's doc each time.
  const rows = createMemo(() => {
    const h = wikilinkHover();
    return h ? h.targets.map((t) => ({ target: t, ...notePreview(t) })) : [];
  });

  // Which row's preview is expanded. Reset whenever the hovered link changes
  // identity — otherwise a card opened over a different link would start with a
  // stale row expanded. -1 = nothing expanded until the pointer enters a row.
  const [activeIdx, setActiveIdx] = createSignal(-1);
  createEffect(() => {
    wikilinkHover();
    setActiveIdx(-1);
  });

  const openFirst = () => {
    const h = wikilinkHover();
    if (h?.targets[0]) openWikilinkTarget(h.targets[0]);
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
                  when={h().targets.length > 1}
                  fallback={
                    <Show
                      when={preview()?.exists}
                      fallback={
                        <div class="wikilink-card__new">
                          <span class="wikilink-card__new-label">New note</span>
                          <span class="wikilink-card__new-title">{h().targets[0]}</span>
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
                  <For each={rows()}>
                    {(row, i) => (
                      <>
                        <div
                          class="wikilink-card__target"
                          classList={{ "is-active": activeIdx() === i() }}
                          onMouseEnter={() => setActiveIdx(i())}
                          onClick={() => {
                            openWikilinkTarget(row.target);
                            hideWikilinkNow();
                          }}
                        >
                          <span class="wikilink-card__target-title">{row.title}</span>
                          <Show when={!row.exists}>
                            <span class="wikilink-card__new-label">New</span>
                          </Show>
                        </div>
                        <Show when={activeIdx() === i()}>
                          <Show
                            when={row.exists}
                            fallback={
                              <div class="wikilink-card__new">
                                <span class="wikilink-card__new-label">New note</span>
                                <span class="wikilink-card__new-title">{row.target}</span>
                              </div>
                            }
                          >
                            <div class="wikilink-card__target-preview">
                              <div class="wikilink-card__body">
                                <For
                                  each={row.lines}
                                  fallback={
                                    <span class="wikilink-card__empty">Empty note</span>
                                  }
                                >
                                  {(line) => <div class="wikilink-card__line">{line}</div>}
                                </For>
                              </div>
                            </div>
                          </Show>
                        </Show>
                      </>
                    )}
                  </For>
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
