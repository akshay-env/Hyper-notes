HyperLinkNotes 2.1.0 puts the AI assistant at the centre: you can now ask about
exactly the words you highlighted, and the answer stays anchored to them.

## Install

Download **HyperLinkNotes_2.1.0_x64-setup.exe** (or the `.msi`) below and run it.

The app renders through the Microsoft Edge **WebView2** runtime, which is
preinstalled on Windows 11 and current Windows 10. The installer fetches it if
it's missing.

Windows will show a SmartScreen warning on first run — expected for an unsigned
independent build. Choose **More info → Run anyway**.

## What's new

**Ask about a selection.** Highlight a passage, right-click (or `Ctrl+Shift+A`),
and ask. The answer appears in a card without touching the note; the passage
keeps a faint dashed underline you can hover later to bring the answer back. Ask
again about the same words and the answers collect as tabs. Any answer can
become its own note — the passage in the original note turns into a link to it,
with your wording preserved.

**Anchoring that survives ambiguity.** The selection is anchored positionally,
not by matching text — so when a word appears several times in a note, the
assistant answers about the occurrence you actually highlighted. The anchoring
survives YAML headers, trimming, and long notes, and is pinned down by 59
automated tests.

**Editor refinements.** Auto-closing brackets, smarter list indentation,
improved syntax highlighting, and external links opening in your browser.

**A leaner codebase.** Dead code, stale build artifacts, and unused assets are
gone, and the README was rewritten around how the assistant actually works.

## Previously in v2

v2 is a ground-up rebuild of the app: **Rust + Tauri 2** backend with a
**SolidJS** frontend, graph physics compiled to **WebAssembly** on a worker
thread, API keys held write-only in the Windows credential store, and every
model request made from Rust. Version 1 was native C++ / Qt 6 / QML and remains
on the [`qt-legacy`](../../tree/qt-legacy) branch under the
[`v1.0.0`](../../releases/tag/v1.0.0) tag.
