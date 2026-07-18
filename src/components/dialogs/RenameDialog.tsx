// Rename dialog: 320px modal reusing the New Folder chrome. Seeded with the
// node's current name; for a note the ".md" is trimmed for editing and re-added
// on save (see confirmRename). Enter confirms, Escape cancels, field autofocuses
// and pre-selects the base name.
import { type Component } from "solid-js";
import { renameTarget, setRenameTarget, confirmRename } from "../../state/ui";
import { DialogShell, DialogActions } from "./DialogShell";

const RenameDialog: Component = () => {
  let input: HTMLInputElement | undefined;
  const initial = () => {
    const t = renameTarget();
    if (!t) return "";
    return t.isFolder ? t.name : t.name.replace(/\.md$/i, "");
  };

  // The field is created fresh on every open (DialogShell mounts its body
  // lazily and unmounts it on exit), so seeding + pre-selecting in the ref
  // callback runs once per open — no onMount/effect needed.
  const seed = (el: HTMLInputElement) => {
    input = el;
    el.value = initial();
    el.select();
  };

  const save = () => {
    const name = input?.value.trim();
    if (!name) {
      setRenameTarget(null);
      return;
    }
    confirmRename(name);
  };
  const cancel = () => setRenameTarget(null);
  // Escape is handled by the dialog itself; only Enter needs wiring here.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") save();
  };

  return (
    <DialogShell
      open={renameTarget() !== null}
      onClose={cancel}
      title="Rename"
      initialFocus={() => input}
      footer={<DialogActions confirmLabel="Save" onCancel={cancel} onConfirm={save} />}
    >
      <div class="dialog__body dialog__body--folder">
        <input ref={seed} class="folder-input" placeholder="Name" onKeyDown={onKey} spellcheck={false} />
      </div>
    </DialogShell>
  );
};

export default RenameDialog;
