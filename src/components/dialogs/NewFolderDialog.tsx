// New-folder dialog (NewFolderDialog.qml): 320px modal — header, name field,
// Cancel / Create. Enter confirms, Escape cancels; the field auto-focuses on
// open. Creates the folder in the reactive vault store (parent captured on open).
import { type Component } from "solid-js";
import { newFolderOpen, setNewFolderOpen, confirmNewFolder } from "../../state/ui";
import { DialogShell, DialogActions } from "./DialogShell";

const NewFolderDialog: Component = () => {
  let input: HTMLInputElement | undefined;

  const create = () => {
    const name = input?.value.trim();
    if (!name) {
      setNewFolderOpen(false);
      return;
    }
    confirmNewFolder(name);
  };
  const cancel = () => setNewFolderOpen(false);
  // Escape is handled by the dialog itself; only Enter needs wiring here.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") create();
  };

  return (
    <DialogShell
      open={newFolderOpen()}
      onClose={cancel}
      title="Create New Folder"
      initialFocus={() => input}
      footer={<DialogActions confirmLabel="Create" onCancel={cancel} onConfirm={create} />}
    >
      <div class="dialog__body dialog__body--folder">
        <input
          ref={input}
          class="folder-input"
          placeholder="Folder Name"
          onKeyDown={onKey}
          spellcheck={false}
        />
      </div>
    </DialogShell>
  );
};

export default NewFolderDialog;
