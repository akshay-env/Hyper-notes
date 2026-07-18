// The currently-open vault. `vaultRoot` is the ABSOLUTE folder path when a real
// vault is open under Tauri (null = mock/browser, or no vault opened yet). The
// filesystem side-effects in the stores fire only when it's set. `vaultName` is
// the folder's display name (title bar + sidebar header).
import { createSignal } from "solid-js";
import { NO_VAULT_NAME } from "./vaultTypes";

export const [vaultRoot, setVaultRoot] = createSignal<string | null>(null);
export const [vaultName, setVaultName] = createSignal(NO_VAULT_NAME);

// Folder name from an absolute path ("C:\\Notes\\My Vault" → "My Vault").
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter((p) => p.length > 0);
  return parts.length ? parts[parts.length - 1] : path;
}
