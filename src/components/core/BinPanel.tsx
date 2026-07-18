// Recycle bin (BinPanel): a centered card over a dimmed backdrop, driven by
// ui.binOpen. Lists soft-deleted items with per-row Restore / Delete, plus Empty
// bin. Restore puts the subtree + its documents back into the vault. Esc or the
// backdrop closes it.
import { type Component, For, Show, onMount, onCleanup } from "solid-js";
import { TrashIcon, FolderIcon, DocIcon } from "../icons/Icons";
import { closeBin } from "../../state/ui";
import { binItems, restoreFromBin, deleteFromBin, emptyBin } from "../../state/bin";

function displayName(name: string, isFolder: boolean): string {
  return isFolder ? name : name.replace(/\.md$/i, "");
}
function locationOf(originalPath: string): string {
  const dir = originalPath.slice(0, originalPath.lastIndexOf("/"));
  return dir === "" ? "Vault root" : dir.replace(/^\//, "");
}
function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const BinPanel: Component<{ closing?: () => boolean }> = (props) => {
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeBin();
  onMount(() => document.addEventListener("keydown", onKey));
  onCleanup(() => document.removeEventListener("keydown", onKey));

  return (
    <div class="bin-overlay" classList={{ "is-closing": props.closing?.() }}>
      <div class="bin-backdrop" onClick={closeBin} />

      <div class="bin-card" role="dialog" aria-modal="true" aria-label="Recycle bin">
        <div class="bin-header">
          <TrashIcon size={16} />
          <span class="bin-title">Bin</span>
          <Show when={binItems.length > 0}>
            <span class="bin-count">{binItems.length}</span>
          </Show>
          <div class="bin-header__spacer" />
          <button class="bin-close" onClick={closeBin} title="Close">
            ✕
          </button>
        </div>

        <div class="bin-divider" />

        <div class="bin-body">
          <Show
            when={binItems.length > 0}
            fallback={
              <div class="bin-empty">
                <div class="bin-empty__title">The bin is empty</div>
                <div class="bin-empty__hint">Deleted notes and folders show up here.</div>
              </div>
            }
          >
            <For each={binItems}>
              {(entry) => (
                <div class="bin-row">
                  <span class="bin-row__icon">
                    {entry.isFolder ? <FolderIcon size={15} /> : <DocIcon size={15} />}
                  </span>
                  <div class="bin-row__info">
                    <span class="bin-row__name">{displayName(entry.name, entry.isFolder)}</span>
                    <span class="bin-row__meta">
                      {locationOf(entry.originalPath)}
                      {entry.isFolder ? ` · ${entry.itemCount} items` : ""} · {ago(entry.deletedAt)}
                    </span>
                  </div>
                  <div class="bin-row__actions">
                    <button class="bin-btn bin-btn--restore" onClick={() => restoreFromBin(entry.id)}>
                      Restore
                    </button>
                    <button class="bin-btn bin-btn--delete" onClick={() => deleteFromBin(entry.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>

        <div class="bin-footer">
          <Show when={binItems.length > 0}>
            <button class="bin-empty-btn" onClick={emptyBin}>
              Empty bin
            </button>
          </Show>
          <div class="bin-header__spacer" />
          <button class="bin-done" onClick={closeBin}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default BinPanel;
