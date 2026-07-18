# Third-party notices

HyperLinkNotes' own source code is licensed under the Apache License 2.0
(see `LICENSE`).

Version 2 is built on **Tauri**, not Qt. The Qt/LGPL notice that applied to
version 1 no longer applies: this build does not link or ship Qt. The v1 sources
remain on the `qt-legacy` branch and under the `v1.0.0` tag, where that notice
still holds.

## Runtime

- **Tauri** (https://tauri.app) — MIT OR Apache-2.0. The shell, the Rust backend,
  and the Windows packaging.
- **Microsoft Edge WebView2** — the app renders through the WebView2 runtime that
  ships with Windows. It is distributed by Microsoft under the
  [WebView2 Runtime EULA](https://developer.microsoft.com/microsoft-edge/webview2/),
  is not bundled in this repository, and is not covered by this project's licence.

## Frontend

| Component | Licence | Use |
| --- | --- | --- |
| [SolidJS](https://solidjs.com) | MIT | UI runtime |
| [Ark UI](https://ark-ui.com) | MIT | Accessible dialog, menu and popover primitives |
| [CodeMirror 6](https://codemirror.net) | MIT | The Markdown editor and its live preview |
| [Lezer](https://lezer.codemirror.net) | MIT | Markdown parsing |
| [PixiJS](https://pixijs.com) | MIT | WebGL rendering for the note graph |
| [d3-force](https://d3js.org) | ISC | Force-directed graph layout |
| [KaTeX](https://katex.org) | MIT | Math rendering in notes |
| [Tailwind CSS](https://tailwindcss.com) | MIT | Layout utilities (geometry only — colour comes from this project's own tokens) |
| [AssemblyScript](https://assemblyscript.org) | Apache-2.0 | Compiles the WebAssembly physics kernel |

## Assets

- Callout and interface icons are [Lucide](https://lucide.dev) path data — ISC.

Each dependency's full licence text ships inside its own package under
`node_modules/`, and the resolved set is pinned in `package-lock.json`.
