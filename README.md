# HyperLinkNotes

**A local-first, networked note-taking app for Windows — a live force-directed
graph of your notes, an Obsidian-style live-preview Markdown editor, and an AI
assistant that understands your notebook.**

Version 2 is a ground-up rebuild on **Rust + Tauri + SolidJS**, with the graph
physics compiled to **WebAssembly**. Version 1 was native C++/Qt 6 — it lives on
the [`qt-legacy`](../../tree/qt-legacy) branch and under the `v1.0.0` tag.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/Tauri-2-24C8DB.svg?logo=tauri&logoColor=white)](https://tauri.app)
[![SolidJS](https://img.shields.io/badge/SolidJS-1.9-2c4f7c.svg?logo=solid&logoColor=white)](https://solidjs.com)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078d6.svg?logo=windows&logoColor=white)](#install)

---

## What it does

**Links are the point.** Write `[[Another note]]` and the link resolves as you
type; hover it to preview the target, click to open it, click an unresolved one
to create it. A link can carry several targets — `[[Design|Research]]` opens a
menu rather than a single note.

**The graph is a real view, not a decoration.** Every note is a node, every
wikilink an edge, laid out by a force simulation that runs in WebAssembly on a
worker thread so the UI never stutters. It opens as its own tab, and a live
mini-graph sits in the side panel while you write.

**The editor renders as you write.** Headings, tasks, callouts, tables, math,
tags and images preview inline; the raw Markdown is still there when your cursor
enters the line. Three modes — live preview, source, and reading.

**AI that reads your notebook.** Ask a question and the answer streams into the
note, using the current note plus its ancestors and linked neighbours as context.
Bring your own key: Anthropic, Gemini, OpenAI, or any OpenAI-compatible endpoint.

**Your notes stay yours.** A vault is a plain folder of `.md` files on your disk.
No account, no sync service, no telemetry.

## Design

The interface aims to feel like a native desktop app rather than a web page in a
window: one accent used sparingly, type and shape carrying the identity instead
of colour, and motion that settles firmly with no overshoot. Every colour resolves
through a token system, and a contrast test asserts that **no token can become
invisible on any of the 220,943 background/accent combinations** the Appearance
editor can produce.

Appearance is fully themeable — mode, accent, background, font, and per-element
colour overrides for buttons, tags, links and headings, saveable as named themes.

## Install

Grab the latest Windows x64 installer from the
[Releases page](../../releases/latest).

> The app renders through the Microsoft Edge **WebView2** runtime, which is
> preinstalled on Windows 11 and current Windows 10. The installer fetches it if
> it's missing.

## Build from source

Requires [Node.js](https://nodejs.org) 18+, the
[Rust toolchain](https://rustup.rs), and the Tauri
[Windows prerequisites](https://tauri.app/start/prerequisites/) (MSVC build tools
and the WebView2 SDK).

```bash
npm install
npm run tauri dev      # run the desktop app in development
npm run tauri build    # produce the Windows installers
```

Other useful scripts:

```bash
npm run dev            # frontend only, in a browser at :1420
npm test               # graph physics + theme contrast suites
npm run asbuild        # recompile the AssemblyScript physics kernel to wasm
```

## Project layout

```
src/                 SolidJS frontend
  components/        App chrome — sidebar, tabs, panels, dialogs, settings
  editor/            CodeMirror 6 setup, live preview, wikilinks, callouts
  graph/             Graph data, physics (JS + wasm), Pixi renderer
  theme/             Design tokens, colour engine, motion vocabulary
  ai/                Prompt context assembly and answer streaming
  state/             Signals — vault, tabs, UI, theme, settings
src-tauri/           Rust backend — vault filesystem, LLM calls, keychain
assembly/            AssemblyScript source for the physics kernel
```

API keys are held in the OS credential store and are **write-only** to the
frontend: the app can save a key but can never read it back, and all model calls
are made from Rust.

## Licence

Apache 2.0 — see [LICENSE](LICENSE). Third-party components are listed in
[NOTICE.md](NOTICE.md).
