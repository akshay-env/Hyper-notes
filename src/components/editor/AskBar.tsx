// Ask-AI bar, docked to the bottom of the editor. Collapsed it's a compact gold
// "Ask" button anchored beside the right panel (with a small gap); clicking it (or
// ⌘/Ctrl+K) extends a long search bar LEFTWARD — the button stays the right anchor
// and the bar reaches toward the left panel, stopping with the same gap. Because the
// bar spans the editor area, it resizes automatically as either side panel is
// dragged. It collapses again on Esc, on the Ask button when empty, or on an outside
// click while empty. Enter (or Ask with text) streams the answer into the note.
import { type Component, Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import {
  askOpen,
  asking,
  askError,
  askSelection,
  searchStatus,
  openAsk,
  closeAsk,
  stopAsk,
  submitAsk,
} from "../../state/ai";
import { aiEnabled, webSearch, setWebSearch, webSearchSupported } from "../../state/settings";
import { openSettings } from "../../state/ui";

const AskBar: Component = () => {
  let rootRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;
  const [text, setText] = createSignal("");

  const collapse = () => {
    closeAsk();
    setText("");
  };

  // The pill/Ask button: expand when collapsed; ask when there's text; minimise
  // when open but empty (mirrors the Qt "click-when-empty minimises" behaviour).
  const onButton = () => {
    if (!askOpen()) {
      openAsk();
      return;
    }
    if (asking()) return;
    const q = text();
    if (!q.trim()) {
      collapse();
      return;
    }
    void submitAsk(q);
    setText("");
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onButton();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (asking()) stopAsk();
      else collapse();
    }
  };

  createEffect(() => {
    if (askOpen()) queueMicrotask(() => inputRef?.focus());
  });

  const onGlobalKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      askOpen() ? collapse() : openAsk();
    }
  };
  // Click anywhere outside the bar while it's open + empty → minimise.
  const onDocDown = (e: MouseEvent) => {
    if (!askOpen() || asking() || text().trim()) return;
    if (rootRef && !rootRef.contains(e.target as Node)) collapse();
  };
  onMount(() => {
    document.addEventListener("keydown", onGlobalKey);
    document.addEventListener("mousedown", onDocDown, true);
  });
  onCleanup(() => {
    document.removeEventListener("keydown", onGlobalKey);
    document.removeEventListener("mousedown", onDocDown, true);
  });

  return (
    <div class="ask-bar" ref={rootRef}>
      <div class="ask-wrap" classList={{ "is-open": askOpen() }}>
        <svg class="ask-lead" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.6-3.6" />
        </svg>
        <input
          ref={inputRef}
          class="ask-input"
          placeholder={
            !aiEnabled()
              ? "Add an API key in Settings"
              : askSelection()
                ? "Ask about the selected text…"
                : "Ask about this note…"
          }
          value={text()}
          spellcheck={false}
          disabled={asking()}
          tabindex={askOpen() ? 0 : -1}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={onKey}
        />
        {/* Only offered when the selected provider+model can actually search —
            otherwise the toggle would silently do nothing (or fail the request). */}
        <Show when={askOpen() && webSearchSupported()}>
          <button
            class="ask-globe"
            classList={{ "is-on": webSearch() }}
            title={
              webSearch()
                ? "Web search on — answers can use the internet"
                : "Web search off — answers use your notes only"
            }
            aria-pressed={webSearch()}
            tabindex={askOpen() ? 0 : -1}
            onClick={() => setWebSearch(!webSearch())}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18" />
              <path d="M12 3c2.6 2.7 4 5.9 4 9s-1.4 6.3-4 9c-2.6-2.7-4-5.9-4-9s1.4-6.3 4-9z" />
            </svg>
          </button>
        </Show>
        <Show
          when={asking()}
          fallback={
            <button class="ask-go" onClick={onButton} title="Ask AI  (⌘K)">
              <svg class="ask-go__spark" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.5l1.7 5.3a3 3 0 0 0 1.9 1.9l5.3 1.7-5.3 1.7a3 3 0 0 0-1.9 1.9L12 20.3l-1.7-5.3a3 3 0 0 0-1.9-1.9L3.1 11.4l5.3-1.7a3 3 0 0 0 1.9-1.9L12 2.5z" />
              </svg>
              <span class="ask-go__label">Ask</span>
            </button>
          }
        >
          <button class="ask-go ask-go--stop" onClick={stopAsk}>
            Stop
          </button>
        </Show>
      </div>

      {/* Only errors + the "add a key" prompt surface here. The context we send
          the model (and its one-line summary) is deliberately NOT shown — the
          notebook context is for the AI's eyes only. */}
      <Show
        when={askOpen() && (askSelection() || askError() || searchStatus() !== null || !aiEnabled())}
      >
        <div class="ask-meta">
          <Show when={askSelection()}>
            <span class="ask-chip">Asking about selected text</span>
          </Show>
          <Show when={searchStatus() !== null}>
            <span class="ask-chip">
              {searchStatus() ? `Searching the web: ${searchStatus()}` : "Searching the web…"}
            </span>
          </Show>
          <Show when={askError()}>
            <span class="ask-error">{askError()}</span>
          </Show>
          <Show when={!askError() && !aiEnabled()}>
            <button class="ask-link" onClick={() => openSettings()}>
              Set an API key in Settings →
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default AskBar;
