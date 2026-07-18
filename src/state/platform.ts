// Runtime environment detection. Under Tauri the webview exposes __TAURI_INTERNALS__;
// in a plain browser (the Vite dev preview) it's absent and the app runs on mock
// data. Every filesystem side-effect is gated on this so the browser build keeps
// working with no backend.
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
