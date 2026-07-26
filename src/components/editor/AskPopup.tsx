// The "Ask AI about this" popup, anchored at the asked-about selection (or at
// the hovered .cm-ask-mark on recall). Structurally the WikilinkHoverCard
// pattern: state/askPopup owns the open signal + grace timers; this component
// is CONTROLLED by that signal and Ark only supplies collision-aware
// positioning from the measured rect. It renders the shown entry through its
// lifecycle — input → streaming answer → done (click to save as a note) /
// error (retry).
import { type Component, Show, createMemo, createEffect, onMount, onCleanup } from "solid-js";
import { HoverCard } from "@ark-ui/solid/hover-card";
import { Portal } from "solid-js/web";
import {
  askPopup,
  getAskEntry,
  cancelHideAskPopup,
  scheduleHideAskPopup,
  closeAskPopup,
  stopAskPopup,
  submitAskPopup,
  saveAskPopupAsNote,
} from "../../state/askPopup";
import { aiEnabled } from "../../state/settings";
import { openSettings } from "../../state/ui";

// The snippet header: the selection on one line, capped so a paragraph-sized
// selection can't stretch the popup.
const snippet = (s: string) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 60 ? one.slice(0, 60) + "…" : one;
};

const AskPopup: Component = () => {
  let inputRef: HTMLInputElement | undefined;

  const entry = createMemo(() => {
    const p = askPopup();
    return p ? (getAskEntry(p.id) ?? null) : null;
  });

  // Focus the input when the popup opens in input mode. A plain focus() gets
  // stolen: the Ark context menu that launched us restores focus to <body>
  // AFTER its exit animation (the same restore addLink in EditorContextMenu.tsx
  // works around) — so focus on the next frame AND again once that restore has
  // had time to run.
  createEffect(() => {
    const p = askPopup();
    const e = entry();
    if (!p || !e || e.status() !== "input") return;
    requestAnimationFrame(() => inputRef?.focus());
    window.setTimeout(() => {
      if (askPopup()?.id === p.id && e.status() === "input") inputRef?.focus();
    }, 150);
  });

  // Esc anywhere while the popup is open: stop a running stream, else dismiss.
  const onGlobalKey = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" || !askPopup()) return;
    ev.preventDefault();
    if (entry()?.status() === "asking") stopAskPopup();
    else closeAskPopup();
  };
  onMount(() => document.addEventListener("keydown", onGlobalKey));
  onCleanup(() => document.removeEventListener("keydown", onGlobalKey));

  // Submit and Retry are the same call — the query lives on the entry.
  const submit = () => {
    const p = askPopup();
    const e = entry();
    if (!p || !e || !e.query().trim()) return;
    void submitAskPopup(p.id, e.query());
  };

  const onCardClick = (ev: MouseEvent) => {
    // Keep popup clicks out of the document-level dismissal handlers (editor
    // menu, ask-bar outside-click) so they can't fight the popup.
    ev.stopPropagation();
    const p = askPopup();
    if (p && entry()?.status() === "done") saveAskPopupAsNote(p.id);
  };

  return (
    <HoverCard.Root
      open={askPopup() !== null}
      onOpenChange={(e) => {
        // Ark's own close requests route through the grace timer, which no-ops
        // while the entry is still being typed into or streamed.
        if (!e.open) scheduleHideAskPopup();
      }}
      // Driven entirely by state/askPopup's own timers — no second delay here.
      openDelay={0}
      closeDelay={0}
      positioning={{
        placement: "bottom-start",
        gutter: 6,
        // The anchor is a measured rect inside CodeMirror (the selection's end,
        // or the hovered mark), not a DOM node this component owns.
        getAnchorRect: () => askPopup()?.rect ?? null,
      }}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <HoverCard.Positioner>
          <HoverCard.Content
            class="ask-pop"
            onMouseEnter={cancelHideAskPopup}
            onMouseLeave={scheduleHideAskPopup}
            onMouseDown={(ev) => ev.stopPropagation()}
            onClick={onCardClick}
          >
            <Show when={entry()}>
              {(e) => (
                <>
                  <Show when={e().status() === "input"}>
                    <div class="ask-pop__snippet">{snippet(e().selection)}</div>
                    <Show
                      when={aiEnabled()}
                      fallback={
                        <button class="ask-pop__link" onClick={() => openSettings()}>
                          Set an API key in Settings →
                        </button>
                      }
                    >
                      <form
                        class="ask-pop__form"
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          submit();
                        }}
                      >
                        <input
                          ref={inputRef}
                          class="ask-pop__input"
                          placeholder="Ask about this…"
                          value={e().query()}
                          spellcheck={false}
                          onInput={(ev) => e().setQuery(ev.currentTarget.value)}
                        />
                        <button type="submit" class="ask-pop__go">
                          Ask
                        </button>
                      </form>
                    </Show>
                  </Show>

                  <Show when={e().status() === "asking" || e().status() === "done"}>
                    <div class="ask-pop__q">{e().query()}</div>
                    <Show when={e().status() === "asking" && e().searchStatus() !== null}>
                      <div class="ask-pop__status">
                        {e().searchStatus()
                          ? `Searching the web: ${e().searchStatus()}`
                          : "Searching the web…"}
                      </div>
                    </Show>
                    <div class="ask-pop__a">{e().answer()}</div>
                    <Show when={e().status() === "done"}>
                      <div class="ask-pop__hint">Click to save as note</div>
                    </Show>
                  </Show>

                  <Show when={e().status() === "error"}>
                    <div class="ask-pop__error">{e().error()}</div>
                    <button class="ask-pop__go" onClick={submit}>
                      Retry
                    </button>
                  </Show>
                </>
              )}
            </Show>
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  );
};

export default AskPopup;
