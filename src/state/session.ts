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

// ── Vault gate status ─────────────────────────────────────────────────────────
// Drives App.tsx's choice between the vault-selection landing page (VaultGate)
// and the real shell. "booting" is the initial value: bootVault() (state/ui.ts)
// hasn't yet decided whether a remembered vault will auto-load, so VaultGate
// renders ONLY its window-control bar while booting — never the landing content
// — which is what keeps a remembered vault's load from flashing the gate first.
export type VaultStatus = "booting" | "none" | "open";
export const [vaultStatus, setVaultStatus] = createSignal<VaultStatus>("booting");

// ── Vault persistence (localStorage) ──────────────────────────────────────────
// Remembers which vault to boot into next launch — or, with no filesystem at
// all (the plain browser dev preview), that "Continue without a folder" was
// chosen before — so relaunching doesn't dump you back at the landing page.
// Same try/catch shape as ui.ts's loadWidth/saveWidth: a blocked/unavailable
// localStorage (privacy mode, some sandboxes) degrades to session-only rather
// than throwing. Lives here, not ui.ts: ui.ts already imports from session.ts,
// so session.ts must never import back from ui.ts or the cycle closes.
const LAST_VAULT_KEY = "hln.vault.lastRoot";
const SCRATCH_KEY = "hln.vault.scratch";

export function lastVault(): string | null {
  try {
    return localStorage.getItem(LAST_VAULT_KEY);
  } catch {
    return null;
  }
}
export function rememberVault(root: string): void {
  try {
    localStorage.setItem(LAST_VAULT_KEY, root);
  } catch {
    /* unavailable — session-only */
  }
}
export function forgetVault(): void {
  try {
    localStorage.removeItem(LAST_VAULT_KEY);
  } catch {
    /* unavailable — session-only */
  }
}
export function scratchPreferred(): boolean {
  try {
    return localStorage.getItem(SCRATCH_KEY) === "1";
  } catch {
    return false;
  }
}
export function rememberScratch(): void {
  try {
    localStorage.setItem(SCRATCH_KEY, "1");
  } catch {
    /* unavailable — session-only */
  }
}
