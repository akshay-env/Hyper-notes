// The "Ask AI about this" popup, anchored at the asked-about selection (or at
// the hovered .cm-ask-mark on recall). Structurally the WikilinkHoverCard
// pattern: state/askPopup owns the open signal + grace timers; this component
// is CONTROLLED by that signal and Ark only supplies collision-aware
// positioning from the measured rect. It renders the shown entry through its
// lifecycle — input → streaming answer → done (click to save as a note) /
// error (retry).
//
// One passage can carry SEVERAL questions, so the popup holds a set of entries
// and shows one of them. The set renders as the SAME chip strip a multi-target
// link card uses (its .wikilink-card__target* classes are reused verbatim, not
// re-skinned): hovering a chip reveals that question's answer in the panel
// below the strip, exactly as hovering a link target reveals that note's
// preview. A trailing "+" chip asks another question about the same passage.
import { type Component, Show, For, createMemo, createEffect, onMount, onCleanup } from "solid-js";
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
  setActiveAskEntry,
  askAnotherOnSamePassage,
  type AskPopupEntry,
} from "../../state/askPopup";
import { aiEnabled } from "../../state/settings";
import { openSettings } from "../../state/ui";
import { renderMarkdownBlocks } from "../../editor/markdownRender";
import { parseWikilinkInner } from "../../graph/wikilinkParse";
import { openWikilinkTarget, openNoteById } from "../../state/wikilink";
import { openExternal } from "../../backend/openExternal";

// The snippet header: the selection on one line, capped so a paragraph-sized
// selection can't stretch the popup.
const snippet = (s: string) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 60 ? one.slice(0, 60) + "…" : one;
};

// The answer, rendered as real markdown through the app's escape-first renderer
// (the same one embeds and table cells use) instead of raw syntax in a text
// node. Re-rendered per stream chunk — the renderer is a cheap line scan, and
// an unclosed **marker** mid-stream degrades to literal text, not broken HTML.
const AnswerBody: Component<{ text: string }> = (props) => {
  let ref: HTMLDivElement | undefined;
  createEffect(() => {
    ref?.replaceChildren(renderMarkdownBlocks(props.text));
  });
  // The renderer emits the same .cm-wikilink / .cm-link spans the editor uses,
  // but the editor's domEventHandlers are scoped to the EditorView — links in a
  // body-portaled popup need their own dispatch. stopPropagation matters twice
  // over: the card's own click saves-as-note, and the document-level dismissal
  // handlers would otherwise race the navigation.
  const onClick = (ev: MouseEvent) => {
    const t = ev.target as HTMLElement;
    const idLink = t.closest<HTMLElement>("[data-note-id]");
    if (idLink?.dataset.noteId) {
      ev.stopPropagation();
      ev.preventDefault();
      openNoteById(idLink.dataset.noteId);
      return;
    }
    const wiki = t.closest<HTMLElement>("[data-wikilink]");
    if (wiki?.dataset.wikilink) {
      ev.stopPropagation();
      ev.preventDefault();
      const first = parseWikilinkInner(wiki.dataset.wikilink).targets[0];
      if (first) openWikilinkTarget(first);
      return;
    }
    const link = t.closest<HTMLElement>("[data-href]");
    if (link?.dataset.href) {
      ev.stopPropagation();
      ev.preventDefault();
      void openExternal(link.dataset.href);
    }
  };
  return <div class="ask-pop__a" ref={ref} onClick={onClick} />;
};

const AskPopup: Component = () => {
  let inputRef: HTMLInputElement | undefined;

  const entry = createMemo(() => {
    const p = askPopup();
    return p ? (getAskEntry(p.activeId) ?? null) : null;
  });

  // Every question asked about the hovered passage, already in creation order
  // (state/askPopup owns that ordering — see openAskPopupForMarks). An id whose
  // entry has since gone is skipped rather than rendered as an empty chip.
  const chips = createMemo<AskPopupEntry[]>(() => {
    const p = askPopup();
    if (!p) return [];
    return p.ids.flatMap((id) => {
      const e = getAskEntry(id);
      return e ? [e] : [];
    });
  });

  // The "+" affordance appears once the shown question has an answer: that is
  // the point at which "and another thing about this passage" is a sensible next
  // move, and it keeps the first ask — typing, then streaming — looking exactly
  // as it always has. It is also the ONLY way to ask a second question without
  // re-selecting the text, so it deliberately shows for a single entry too,
  // which is why the strip's visibility below is not just "more than one".
  const showAdd = () => entry()?.status() === "done";
  const showStrip = () => chips().length > 1 || showAdd();

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
      if (askPopup()?.activeId === p.activeId && e.status() === "input") inputRef?.focus();
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

  // Submit and Retry are the same call — the query lives on the entry, and the
  // entry that gets asked is always the ACTIVE one.
  const submit = () => {
    const p = askPopup();
    const e = entry();
    if (!p || !e || !e.query().trim()) return;
    void submitAskPopup(p.activeId, e.query());
  };

  // ⚠ CLICK ROUTING. This fires for every click anywhere in the card, and a
  // click on a finished answer is what saves it as a note. The strip sits inside
  // the same card, so its chips and the "+" MUST stopPropagation: without it,
  // every attempt to switch between questions — or to add one — would silently
  // create a note and close the popup. The two places the save is still meant to
  // fire from are the answer body (whose own onClick stops only for links) and
  // the "Click to save as note" hint, both of which bubble here untouched.
  const onCardClick = (ev: MouseEvent) => {
    // Keep popup clicks out of the document-level dismissal handlers (editor
    // menu, ask-bar outside-click) so they can't fight the popup.
    ev.stopPropagation();
    const p = askPopup();
    if (p && entry()?.status() === "done") saveAskPopupAsNote(p.activeId);
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
            {/* The question strip. Deliberately the multi-target link card's
                classes, not a parallel set of ask-only ones: the user asked for
                "this same hover tab", and reusing them means the wrapping
                layout, the is-active pill and the hover transition are shared
                rather than duplicated and drifting. Only the divider under the
                strip is new (.ask-pop__strip), because the link card gets its
                one from the panel below instead. */}
            <Show when={showStrip()}>
              <div class="wikilink-card__targets ask-pop__strip">
                <For each={chips()}>
                  {(c) => (
                    <div
                      class="wikilink-card__target"
                      classList={{ "is-active": askPopup()?.activeId === c.id }}
                      // Hover selects, like a link card chip revealing its
                      // preview. The click handler exists only to keep the card's
                      // save-as-note off this element (see onCardClick).
                      onMouseEnter={() => setActiveAskEntry(c.id)}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setActiveAskEntry(c.id);
                      }}
                    >
                      {/* An entry added by "+" has no query yet — it is the one
                          being typed, so it says so rather than showing blank. */}
                      <span class="wikilink-card__target-title">
                        {c.query().trim() || "New question…"}
                      </span>
                    </div>
                  )}
                </For>
                <Show when={showAdd()}>
                  <div
                    class="wikilink-card__target ask-pop__chip-add"
                    title="Ask another question about this passage"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      askAnotherOnSamePassage();
                    }}
                  >
                    +
                  </div>
                </Show>
              </div>
            </Show>

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
                    <AnswerBody text={e().answer()} />
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
