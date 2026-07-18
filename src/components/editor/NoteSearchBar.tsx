// In-note find bar (NoteSearchBar.qml): drives the editor's search. Enter runs
// the search (again → next match), the query counter shows "n / total", ▲/▼ step
// through matches, Escape closes. Always mounted; the slot slides it open when
// noteSearchOpen flips (App.tsx).
import { type Component, Show, createSignal, createEffect } from "solid-js";
import {
  runNoteSearch,
  noteSearchNext,
  noteSearchPrev,
  clearNoteSearch,
  searchCount,
  searchCurrent,
} from "../../state/editor";
import { noteSearchOpen, setNoteSearchOpen } from "../../state/ui";
import { ChevronUpSmall, ChevronDownSmall } from "../icons/Icons";

const NoteSearchBar: Component = () => {
  let field: HTMLInputElement | undefined;
  const [searched, setSearched] = createSignal(false);
  const [focused, setFocused] = createSignal(false);

  // Focus + select on open; clear the query and state on close.
  createEffect(() => {
    if (noteSearchOpen()) {
      queueMicrotask(() => {
        field?.focus();
        field?.select();
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

  const hasResults = () => searched() && searchCount() > 0;
  const counterText = () =>
    searchCount() === 0 ? "No results" : `${searchCurrent() + 1} / ${searchCount()}`;

  return (
    <div class={`note-search-bar ${focused() ? "focused" : ""}`}>
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
