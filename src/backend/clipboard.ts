// Cut/copy/paste for the editor context menu. Under Tauri the OS clipboard
// needs its plugin, loaded via a DYNAMIC import — mirrors openVaultDialog in
// state/ui.ts (`const { open } = await import("@tauri-apps/plugin-dialog")`) —
// so the plain-browser dev preview never pulls a Tauri-only module at load; it
// has no __TAURI_INTERNALS__ to satisfy the plugin's invoke() calls anyway.
import { isTauri } from "../state/platform";

export async function clipWrite(text: string): Promise<void> {
  if (isTauri()) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

// Wrapped in try/catch so a denied clipboard permission (or any backend error
// under Tauri) is a silent no-op for a right-click Paste, not an unhandled
// rejection — callers can treat "" as "nothing to paste" either way.
export async function clipRead(): Promise<string> {
  try {
    if (isTauri()) {
      const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
      return (await readText()) ?? "";
    }
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}
