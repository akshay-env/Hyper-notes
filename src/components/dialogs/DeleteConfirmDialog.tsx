// Delete-confirm dialog (DeleteConfirmDialog.qml): 320px modal asking to move an
// item (or N items) to the bin. Enter confirms, Escape cancels. Actual deletion
// is wired to the Tauri backend later.
import { type Component, createMemo, onMount, onCleanup } from "solid-js";
import { deleteTarget, setDeleteTarget, confirmDelete } from "../../state/ui";
import { DialogShell, DialogActions } from "./DialogShell";

const DeleteConfirmDialog: Component = () => {
  // deleteTarget is cleared to null the moment confirm/cancel fires, but the card
  // stays on screen for its exit animation — so latch the last non-null target
  // and render from that, or the text would blank out mid-animation. A memo
  // seeded with its own previous value is the derivation form of the old
  // "snapshot at mount" trick, and survives the body remounting.
  const snap = createMemo<ReturnType<typeof deleteTarget>>(
    (prev) => deleteTarget() ?? prev ?? null,
    null,
  );
  const message = () => {
    const s = snap();
    if (!s) return "";
    return s.count > 1 ? `Move ${s.count} items to the bin?` : `Move '${s.name}' to the bin?`;
  };

  const confirm = () => confirmDelete(); // removes the subtree + its docs + tabs
  const cancel = () => setDeleteTarget(null);

  // Enter-to-confirm. Escape is the dialog's own; this listener is document-level
  // because the confirm dialog has no focused text field to hang a key handler on.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && deleteTarget() !== null) confirm();
  };
  onMount(() => document.addEventListener("keydown", onKey));
  onCleanup(() => document.removeEventListener("keydown", onKey));

  return (
    <DialogShell
      open={deleteTarget() !== null}
      onClose={cancel}
      title="Delete"
      footer={
        <DialogActions confirmLabel="Delete" tone="danger" onCancel={cancel} onConfirm={confirm} />
      }
    >
      <div class="dialog__body dialog__body--delete">
        <p>{message()}</p>
      </div>
    </DialogShell>
  );
};

export default DeleteConfirmDialog;
