// Ask-AI bar, docked to the bottom of the editor. Collapsed it's a compact gold
// "Ask" button anchored beside the right panel (with a small gap); clicking it (or
// ⌘/Ctrl+K) extends a long search bar LEFTWARD — the button stays the right anchor
// and the bar reaches toward the left panel, stopping with the same gap. Because the
// bar spans the editor area, it resizes automatically as either side panel is
// dragged. It collapses again on Esc, on the Ask button when empty, or on an outside
// click while empty. Enter (or Ask with text) streams the answer into the note;
// Shift+Enter inserts a newline instead — the textarea auto-grows up to 5 lines
// (then scrolls) so a multi-line question stays readable while typing it.
import { type Component, Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import {
  askOpen,
  asking,
  askError,
  searchStatus,
  openAsk,
  closeAsk,
  stopAsk,
  submitAsk,
} from "../../state/ai";
import { openAskPopupAt } from "../../state/askPopup";
import { editorView } from "../../state/editor";
import { aiEnabled, webSearch, setWebSearch, webSearchSupported } from "../../state/settings";
import { openSettings } from "../../state/ui";

const AskBar: Component = () => {
  let rootRef: HTMLDivElement | undefined;
  let inputRef: HTMLTextAreaElement | undefined;
  const [text, setText] = createSignal("");

  // Auto-grow up to 5 lines (108px = 5 x 20px line-height + 8px vertical padding,
  // see .ask-wrap.is-open .ask-input in chrome.css), then let the textarea's own
  // scrollbar take over. Reset-then-measure (height:0, then scrollHeight) is the
  // standard trick for reading a textarea's true content height regardless of
  // whatever height it already had. An EMPTY textarea is never measured: the
  // grow runs while the open-width transition is mid-flight, and at ~54px wide
  // the PLACEHOLDER wraps to several lines — measuring then would lock the cap
  // height into an empty bar. Clearing the inline height lets the CSS one-line
  // 28px default govern until there's real text.
  const growTextarea = () => {
    const el = inputRef;
    if (!el) return;
    if (!el.value) {
      el.style.height = "";
      el.style.overflowY = "hidden";
      return;
    }
    el.style.height = "0";
    const needed = el.scrollHeight;
    el.style.height = Math.min(needed, 108) + "px";
    el.style.overflowY = needed > 108 ? "auto" : "hidden";
  };

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
      // Shift+Enter inserts a newline (the browser's own default for a textarea —
      // don't preventDefault); plain Enter submits, multi-line questions included.
      if (e.shiftKey) return;
      e.preventDefault();
      onButton();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (asking()) stopAsk();
      else collapse();
    }
  };

  createEffect(() => {
    // Tracks text() too (not just askOpen()) so every keystroke — and every
    // programmatic reset, e.g. setText("") after submitting — re-measures the
    // grow height. Collapsing clears the inline height so the CSS's 28px
    // collapsed rule (not a stale open-state height) governs again.
    text();
    if (askOpen()) {
      queueMicrotask(() => {
        inputRef?.focus();
        growTextarea();
      });
    } else if (inputRef) {
      inputRef.style.height = "";
      inputRef.style.overflowY = "";
    }
  });

  const onGlobalKey = (e: KeyboardEvent) => {
    // Ctrl/⌘+K toggles the bar. The !e.shiftKey guard keeps Ctrl/⌘+Shift+K out of
    // this branch — that chord is CodeMirror's own defaultKeymap binding for
    // deleteLine, and without the guard this document-level listener would
    // preventDefault() it (and toggle the bar) before it ever reached the editor.
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      askOpen() ? collapse() : openAsk();
      return;
    }
    // Ctrl/⌘+Shift+A — "ask AI about this selection". This can't live in the CM
    // keymap (src/editor/createEditorState.ts) because that file can't import
    // the popup's state module without closing the cycle createEditorState →
    // state/askPopup → state/editor → createEditorState. AskBar already owns
    // this document keydown listener, so handling it here adds zero new
    // coupling — and AskBar is only mounted while a note is open (see the <Show>
    // around <AskBar /> in App.tsx), which is exactly when the shortcut applies.
    // With a selection it opens the anchored Ask popup at the selection's end
    // (same as the right-click "Ask AI about this"); without one it opens this
    // bar. Shift+K (the obvious pairing with the toggle above) is already
    // CodeMirror's deleteLine, hence Shift+A — unbound across defaultKeymap,
    // markdownKeymap, historyKeymap and completionKeymap.
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      const view = editorView();
      const r = view?.state.selection.main;
      if (view && r && !r.empty) {
        const c = view.coordsAtPos(r.to);
        if (c) {
          openAskPopupAt(view.state.sliceDoc(r.from, r.to), r.from, r.to, {
            x: c.left,
            y: c.top,
            width: 1,
            height: c.bottom - c.top,
          });
          return;
        }
      }
      openAsk();
      return;
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
        <textarea
          ref={inputRef}
          class="ask-input"
          placeholder={!aiEnabled() ? "Add an API key in Settings" : "Ask about this note…"}
          value={text()}
          rows={1}
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
              Ask
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
      <Show when={askOpen() && (askError() || searchStatus() !== null || !aiEnabled())}>
        <div class="ask-meta">
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
