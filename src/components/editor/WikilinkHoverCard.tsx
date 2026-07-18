// Floating card shown when hovering a rendered [[wikilink]] in the editor. It is
// always a short PREVIEW of the link's first target (title + first lines), like
// Obsidian. Choosing among a multi-target link's notes, opening all in tabs, or
// adding a note lives on the link's right-click menu (EditorContextMenu), not here.
//
// The open/close state machine stays in state/wikilink.ts — the editor's link
// plugin drives it and owns the hover grace period. This component is CONTROLLED
// by that signal; Ark only supplies positioning, which is now collision-aware:
// a link near the bottom of the window flips its card above rather than letting
// it run off-screen (the old hand-rolled clamp could only push it down).
import { type Component, Show, For, createMemo } from "solid-js";
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
              )}
            </Show>
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  );
};

export default WikilinkHoverCard;
