HyperLinkNotes v2 is a ground-up rebuild. Version 1 was native C++ / Qt 6 / QML;
v2 runs on **Rust + Tauri 2** with a **SolidJS** frontend and the graph physics
compiled to **WebAssembly**.

The v1 sources remain available on the [`qt-legacy`](../../tree/qt-legacy) branch
and under the [`v1.0.0`](../../releases/tag/v1.0.0) tag.

## Install

Download **HyperLinkNotes_2.0.1_x64-setup.exe** (or the `.msi`) below and run it.

The app renders through the Microsoft Edge **WebView2** runtime, which is
preinstalled on Windows 11 and current Windows 10. The installer fetches it if
it's missing.

## What's new

**A new engine.** The vault filesystem, model calls and credential storage moved
into a Rust backend. API keys now live in the Windows credential store and are
write-only to the interface — the app can save a key but can never read it back,
and every model request is made from Rust.

**Faster graph.** The force simulation is compiled to WebAssembly and runs on a
worker thread, so layout no longer competes with the interface for frames. The
graph is now a proper tab rather than an overlay, and a live mini-graph sits in
the side panel while you write.

**A rebuilt interface.** The app was redesigned to feel native rather than like a
web page in a window:

- Flat tab strip with an underline selection indicator, replacing browser-style
  notched tabs.
- The accent colour is reserved for selection, links and one primary action per
  surface; everything else is neutral.
- Editorial display serif for the note title and H1–H3. Headings are no longer
  underlined — the app ships its own editor highlight style, so source mode
  re-themes with your palette instead of falling back to web defaults.
- Overlay scrollbars, a compact floating find bar, and real elevation on menus,
  dialogs and popovers.
- Motion rebuilt to settle firmly with no overshoot or bounce (90/150/220 ms),
  and `prefers-reduced-motion` is honoured throughout.

**Theming.** Mode, accent, background, font and per-element colour overrides for
buttons, tags, links and headings, saveable as named themes. A test asserts that
no token can become invisible across all **220,943** background/accent
combinations the editor can produce.

**Callouts** were recoloured to sit inside your theme rather than override it.

## Unchanged

Wikilinks (including multi-target `[[A|B]]` links), the AI ask bar and its
notebook-aware context, and the Appearance settings all work as before. A vault
is still a plain folder of `.md` files on your disk — no account, no sync
service, no telemetry.

## Known limitations

- Windows x64 only in this release.
- The app is not code-signed, so SmartScreen will warn on first run. Choose
  **More info → Run anyway**.
