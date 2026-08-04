// Ask-AI bar, docked to the bottom of the editor. Collapsed it's a compact gold
// "Ask" button anchored beside the right panel (with a small gap); clicking it (or
// ⌘/Ctrl+K) extends a long search bar LEFTWARD — the button stays the right anchor
// and the bar reaches toward the left panel, stopping with the same gap. Because the
// bar spans the editor area, it resizes automatically as either side panel is
// dragged. It collapses again on Esc, on the Ask button when empty, or on an outside
// click while empty. Enter (or Ask with text) streams the answer into the note;
// Shift+Enter inserts a newline instead — the textarea auto-grows up to 5 lines
// (then scrolls) so a multi-line question stays readable while typing it.
//
// Collapsed anchoring: the ROOT keeps spanning the editor area untouched (its right
// edge is what measureColumn() measures the open bar's column against), and only the
// pill is offset — by --ask-collapsed-mr, consumed by .ask-wrap in chrome.css and
// overridden by .ask-wrap.is-open. That offset carries the right panel's width while
// the panel is CLOSED, which looks odd until you watch a toggle: closing the dock
// widens the editor area by W, so without the term the pill would jump right by W.
// Adding W back holds it still — and because margin-right transitions on the same
// --dur-3/--ease-out curve as the dock's width, the two cancel every frame, not just
// at the endpoints. With the panel OPEN the term is 0, so dragging its resize handle
// still carries the pill inward with the editor area.
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
import { openSettings, rightPanelOpen, rightPanelWidth } from "../../state/ui";

// Extra inward nudge for the COLLAPSED pill, on top of the .ask-bar container's
// 12px --ask-gap: the pill was reading as glued to the right-panel seam, and this
// lifts it off into the editor without moving the container (whose right edge the
// open bar's column measurement depends on).
const COLLAPSED_NUDGE = 10;

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

  // ── Column alignment ────────────────────────────────────────────────────────
  // The OPEN bar spans the editor's readable column — the same span the note's
  // text occupies — via --ask-open-w/-mr on the root (consumed by
  // .ask-wrap.is-open in chrome.css). Measured off the live editor rather than
  // computed in CSS: the column's position depends on the dock-centring pads AND
  // the scrollbar-gutter var scrollbarPadPlugin writes straight onto the
  // scroller, which no rule at the bar's level can read.
  let lastW = -1;
  let lastMr = -1;
  const measureColumn = (): boolean => {
    const root = rootRef;
    const view = editorView();
    if (!root || !view) return false;
    const rect = view.contentDOM.getBoundingClientRect();
    const cs = getComputedStyle(view.contentDOM);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    // Bar edges land on the TEXT's edges (the content box minus its own inner
    // padding) — the same span the inline title input covers — not the 920px
    // content box, whose 52px breathing room would leave the bar looking wider
    // than the writing it sits under.
    const w = Math.max(0, rect.width - padL - padR);
    const mr = Math.max(0, root.getBoundingClientRect().right - (rect.right - padR));
    // Skip no-op writes: contentDOM's ResizeObserver fires on every HEIGHT change
    // (typing, streaming), and none of those move the column horizontally.
    if (Math.abs(w - lastW) < 0.5 && Math.abs(mr - lastMr) < 0.5) return false;
    lastW = w;
    lastMr = mr;
    root.style.setProperty("--ask-open-w", `${w}px`);
    root.style.setProperty("--ask-open-mr", `${mr}px`);
    return true;
  };

  createEffect(() => {
    const view = editorView();
    if (!askOpen() || !view) return;
    // Fresh measurement on every open (and editor swap): the vars may be stale
    // from a layout that changed while the bar was collapsed. Writing them in
    // the same update as the is-open class means the open transition animates
    // straight to the right geometry.
    lastW = lastMr = -1;
    measureColumn();
    // While open, follow the column live (dock toggles/drags, window resizes).
    // Those arrive as a burst of per-frame resizes, and easing toward a target
    // that moves every frame would trail the column — so tracking updates run
    // with the wrap's transition cut (.ask-bar--sync) until the burst goes
    // quiet. The initial RO fire on observe() re-measures unchanged values — the
    // synchronous measure just above already banked them — and falls out at the
    // no-op check on the frame it schedules, so it never cuts the opening
    // animation.
    let syncTimer = 0;
    // The observer only SCHEDULES; the frame does the work. measureColumn() forces
    // layout three times over (a rect plus a getComputedStyle on contentDOM, then a
    // rect on the root), and this observer watches TWO elements, so a dock drag can
    // enter the callback more than once in the same frame and pay all of it again
    // for a column that can only have one position per frame. One pending frame id
    // at a time collapses that burst to a single measurement, whatever fires it.
    let frame = 0;
    const sync = () => {
      frame = 0;
      if (!measureColumn()) return;
      rootRef?.classList.add("ask-bar--sync");
      window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => rootRef?.classList.remove("ask-bar--sync"), 150);
    };
    const ro = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(sync);
    });
    // scrollDOM's CONTENT box shrinks when the centring pads or gutter var
    // change even though the pane hasn't moved; contentDOM catches the column
    // itself resizing once the pane squeezes under the 920px cap.
    ro.observe(view.scrollDOM);
    ro.observe(view.contentDOM);
    onCleanup(() => {
      ro.disconnect();
      // Nothing left to measure against once the bar closes or the editor swaps —
      // and `sync` would touch a rootRef that is on its way out.
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(syncTimer);
      rootRef?.classList.remove("ask-bar--sync");
    });
  });

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
    <div
      class="ask-bar"
      ref={rootRef}
      // Declarative, not root.style.setProperty in an effect, so it can never race
      // with measureColumn()'s imperative writes of --ask-open-w/--ask-open-mr on
      // this same element. Solid's style() (and its setStyleProperty fast path)
      // only ever setProperty/removeProperty the keys of THIS object and never
      // rewrites cssText for an object-valued style prop — the other two vars are
      // untouched. See node_modules/solid-js/web/dist/web.js, style().
      style={{
        "--ask-collapsed-mr": `${(rightPanelOpen() ? 0 : rightPanelWidth()) + COLLAPSED_NUDGE}px`,
      }}
    >
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
