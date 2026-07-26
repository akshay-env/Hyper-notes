// Opens an external URL in the system browser. Under Tauri the opener plugin
// is loaded via a DYNAMIC import — same rule as backend/clipboard.ts — so the
// plain-browser dev preview never pulls a Tauri-only module at load; there it
// falls back to window.open. Only http(s) URLs are ever passed through: a note
// is user-editable text, and letting arbitrary schemes (file:, javascript:…)
// reach the OS opener from note content would be an injection hole.
import { isTauri } from "../state/platform";

const WEB_URL_RE = /^https?:\/\//i;

export async function openExternal(url: string): Promise<void> {
  if (!WEB_URL_RE.test(url)) return;
  try {
    if (isTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    // A refused/failed open is a silent no-op, not an unhandled rejection.
  }
}
