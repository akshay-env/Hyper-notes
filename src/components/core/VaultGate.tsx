// Vault-selection landing page — rendered INSTEAD of the shell while no vault
// is open (App.tsx's <Show> fallback). Because tauri.conf.json sets
// decorations:false, this is also the only way to move, minimise or close the
// frameless window before a vault is chosen, hence the bar of window controls
// carried at the top even though the rest of the page is centred content.
import { type Component, Show, createSignal } from "solid-js";
import WindowControlButton from "../WindowControlButton";
import { minimizeWindow, toggleMaximizeWindow, closeWindow } from "../../backend/window";
import { isTauri } from "../../state/platform";
import { vaultStatus } from "../../state/session";
import {
  vaultError,
  setVaultError,
  openVaultDialog,
  createVaultAt,
  useScratchVault,
} from "../../state/ui";

const VaultGate: Component = () => {
  // "Create new vault" is two steps in place, not a second dialog: pick a
  // parent folder via the OS picker, then name the new folder inline. This
  // signal doubles as the step flag — null until a folder's been chosen, which
  // is the same moment the actions row swaps for the name field below.
  const [pendingDir, setPendingDir] = createSignal<string | null>(null);
  let nameInput: HTMLInputElement | undefined;

  const pickCreateFolder = async () => {
    if (!isTauri()) return; // no filesystem to pick from in the dev preview
    setVaultError(null);
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true, multiple: false, title: "Choose where to create the vault" });
    if (typeof dir === "string") setPendingDir(dir);
    // else: the OS picker was cancelled — stay on the two-button row.
  };

  // The field is created fresh each time the name step appears (the sibling
  // Show branch unmounts), so seeding the default name + focusing it here runs
  // once per appearance — no onMount/effect needed (mirrors RenameDialog).
  const seedName = (el: HTMLInputElement) => {
    nameInput = el;
    el.value = "My Vault";
    el.focus();
    el.select(); // pre-selected so typing immediately replaces it
  };

  const confirmCreate = async () => {
    const dir = pendingDir();
    if (!dir) return;
    try {
      await createVaultAt(dir, nameInput?.value ?? "My Vault");
    } catch (e) {
      console.error("create vault:", e);
      setVaultError("Couldn't create the vault there. Choose a different folder.");
      setPendingDir(null); // back to the two-button row
    }
  };
  const cancelCreate = () => setPendingDir(null);
  const onNameKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void confirmCreate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelCreate();
    }
  };

  const handleOpenExisting = async () => {
    setVaultError(null);
    try {
      await openVaultDialog();
    } catch (e) {
      console.error("open vault:", e);
      setVaultError("That folder is no longer available.");
    }
  };

  return (
    <div class="vault-overlay">
      {/* decorations:false means this bar is the ONLY way to move, maximise or
          close the window before a vault is open — identical controls to
          TitleBar, wired to the same backend/window.ts helpers. */}
      <div class="vault-overlay__bar" data-tauri-drag-region>
        <WindowControlButton type="minimize" onClick={() => minimizeWindow()} />
        <WindowControlButton type="maximize" onClick={() => toggleMaximizeWindow()} />
        <WindowControlButton type="close" onClick={() => closeWindow()} />
      </div>

      {/* Nothing below the bar renders while a remembered vault is still
          loading (vaultStatus "booting") — otherwise the landing content would
          flash on screen for a frame before the real shell swaps in. */}
      <Show when={vaultStatus() !== "booting"}>
        <div class="vault-overlay__title">HyperLink Notes</div>
        <div class="vault-overlay__sub">A vault is a folder of markdown notes on your computer.</div>

        <Show
          when={pendingDir() !== null}
          fallback={
            <div class="vault-overlay__actions">
              <button class="vault-overlay__btn" onClick={() => void pickCreateFolder()}>
                Create new vault
              </button>
              <button class="new-tab-btn new-tab-btn--ghost" onClick={() => void handleOpenExisting()}>
                Open existing vault
              </button>
            </div>
          }
        >
          <div class="vault-overlay__actions">
            <input
              ref={seedName}
              class="folder-input vault-overlay__name"
              onKeyDown={onNameKey}
              spellcheck={false}
            />
            <button class="vault-overlay__btn" onClick={() => void confirmCreate()}>
              Create
            </button>
          </div>
        </Show>

        {/* Only the dev preview (npm run dev, no Tauri) lacks a filesystem to
            open or create a vault in — a Tauri build always has one of those
            two, so this third option stays hidden there. */}
        <Show when={!isTauri()}>
          <button class="text-btn" onClick={() => useScratchVault()}>
            Continue without a folder
          </button>
        </Show>

        <Show when={vaultError()}>
          <div class="vault-overlay__error">{vaultError()}</div>
        </Show>
      </Show>
    </div>
  );
};

export default VaultGate;
