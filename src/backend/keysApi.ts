// Typed wrappers over the Rust key-custody commands (see src-tauri/src/commands/keys.rs).
// Keys live in the OS credential store and are write-only from here: there is no
// getter by design, so a compromised frontend has nothing to read. Presence is the
// only thing the UI can observe. Callers must guard on isTauri().
import { invoke } from "@tauri-apps/api/core";

/// Store a key for a provider. Passing a blank key clears it.
export const setApiKey = (provider: string, key: string) =>
  invoke<void>("set_api_key", { provider, key });

export const hasApiKey = (provider: string) => invoke<boolean>("has_api_key", { provider });

export const clearApiKey = (provider: string) => invoke<void>("clear_api_key", { provider });

/// Hand a legacy localStorage key to the credential store. Resolves true if it was
/// adopted, false if the store already had one (in which case the stored key wins).
export const migrateApiKey = (provider: string, key: string) =>
  invoke<boolean>("migrate_api_key", { provider, key });
