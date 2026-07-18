// "Add note" dialog: names the note appended to a wikilink's targets (the link's
// right-click → "Add note"). Enter confirms, Escape cancels; the field auto-
// focuses. On confirm the name is appended to the link ([[A]] → [[A | B]]) and
// the note is created in the current note's folder if it doesn't exist yet.
import { type Component } from "solid-js";
import { addNoteLink, confirmAddNote, cancelAddNote } from "../../state/wikilink";
import { DialogShell, DialogActions } from "./DialogShell";

const AddNoteDialog: Component = () => {
  let input: HTMLInputElement | undefined;

  const create = () => {
    const name = input?.value.trim();
    if (!name) {
      cancelAddNote();
      return;
    }
    confirmAddNote(name);
  };
  // Escape is handled by the dialog itself; only Enter needs wiring here.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") create();
  };

  return (
    <DialogShell
      open={addNoteLink() !== null}
      onClose={cancelAddNote}
      title="Add Note"
      initialFocus={() => input}
      footer={<DialogActions confirmLabel="Add" onCancel={cancelAddNote} onConfirm={create} />}
    >
      <div class="dialog__body dialog__body--folder">
        <input
          ref={input}
          class="folder-input"
          placeholder="Note Name"
          onKeyDown={onKey}
          spellcheck={false}
        />
      </div>
    </DialogShell>
  );
};

export default AddNoteDialog;
