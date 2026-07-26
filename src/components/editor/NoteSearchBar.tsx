// In-note find bar (NoteSearchBar.qml): drives the editor's search. Enter runs
// the search (again → next match), the query counter shows "n / total", ▲/▼ step
// through matches, Escape closes. Always mounted; the slot slides it open when
// noteSearchOpen flips (App.tsx).
import { type Component, Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import {
  runNoteSearch,
  noteSearchNext,
  noteSearchPrev,
  clearNoteSearch,
  searchCount,
  searchCurrent,
} from "../../state/editor";
import { noteSearchOpen, setNoteSearchOpen, noteSearchSeed, setNoteSearchSeed } from "../../state/ui";
import { ChevronUpSmall, ChevronDownSmall } from "../icons/Icons";

const NoteSearchBar: Component = () => {
  let rootRef: HTMLDivElement | undefined;
  let field: HTMLInputElement | undefined;
  const [searched, setSearched] = createSignal(false);
  const [focused, setFocused] = createSignal(false);

  // Focus + select on open; clear the query and state on close. Reading
  // noteSearchSeed() here (not just inside the microtask) subscribes this effect
  // to it too, so a right-click "Search for …" seed is picked up even when the
  // bar is ALREADY open — not just on the open-transition.
  createEffect(() => {
    const seed = noteSearchSeed();
    if (noteSearchOpen()) {
      queueMicrotask(() => {
        // field is the always-mounted input's ref, so it already exists by the
        // time this microtask runs — safe to assign .value before focusing.
        if (seed.trim() !== "") {
          if (field) field.value = seed;
          runNoteSearch(seed);
          setSearched(true); // reveals the "n / total" counter + ▲/▼ nav
          setNoteSearchSeed(""); // one-shot: consume so it doesn't refire
          field?.focus();
        } else {
          // No seed: today's plain-open behaviour, unchanged.
          field?.focus();
          field?.select();
        }
      });
    } else {
      if (field) field.value = "";
      setSearched(false);
      clearNoteSearch();
    }
  });

  const doSearch = () => {
    const term = field?.value ?? "";
    if (term.trim() === "") {
      clearNoteSearch();
      setSearched(false);
      return;
    }
    if (searched()) noteSearchNext();
    else {
      runNoteSearch(term);
      setSearched(true);
    }
  };

  // Editing the query invalidates the previous run; results hide until Enter.
  const onInput = () => {
    if (searched()) {
      setSearched(false);
      clearNoteSearch();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSearch();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setNoteSearchOpen(false);
    }
  };

  // Click anywhere outside the bar while it's open → collapse (mirrors AskBar's
  // onDocDown). Capture-phase so this fires before CodeMirror's own mousedown
  // handling swallows the click on the editor.
  const onDocDown = (e: MouseEvent) => {
    if (!noteSearchOpen()) return;
    const t = e.target as Element | null;
    if (rootRef && t && rootRef.contains(t)) return; // the bar itself: field, counter, ▲ ▼
    if (t?.closest?.("[data-find-toggle]")) return; // let the toolbar button own the toggle
    setNoteSearchOpen(false);
  };
  onMount(() => document.addEventListener("mousedown", onDocDown, true));
  onCleanup(() => document.removeEventListener("mousedown", onDocDown, true));

  const hasResults = () => searched() && searchCount() > 0;
  const counterText = () =>
    searchCount() === 0 ? "No results" : `${searchCurrent() + 1} / ${searchCount()}`;

  return (
    <div class={`note-search-bar ${focused() ? "focused" : ""}`} ref={rootRef}>
      <input
        ref={field}
        class="note-search-bar__field"
        placeholder="Find in note…"
        onInput={onInput}
        onKeyDown={onKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        spellcheck={false}
      />

      <Show when={searched()}>
        <span class="note-search-bar__counter">{counterText()}</span>
      </Show>

      <Show when={hasResults()}>
        <div class="note-search-bar__nav">
          <button class="nsb-btn" title="Previous match" onClick={() => noteSearchPrev()}>
            <ChevronUpSmall />
          </button>
          <button class="nsb-btn" title="Next match" onClick={() => noteSearchNext()}>
            <ChevronDownSmall />
          </button>
        </div>
      </Show>
    </div>
  );
};

export default NoteSearchBar;
