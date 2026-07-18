// Native window controls (frameless custom title bar). The Tauri window API is
// dynamically imported so a plain browser never loads it; each call no-ops unless
// running under Tauri.
import { isTauri } from "../state/platform";

async function win() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return;
  (await win()).minimize();
}
export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauri()) return;
  (await win()).toggleMaximize();
}
export async function closeWindow(): Promise<void> {
  if (!isTauri()) return;
  (await win()).close();
}
