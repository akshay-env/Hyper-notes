// Bottom status bar (StatusBar.qml, height 26): word + character counts (left)
// and the note's vault-relative path (right). Both follow the active note live.
// Text only on the left — no icon — so the counts sit exactly on the sidebar's
// --gutter alignment line.
import type { Component } from "solid-js";
import { editorDoc } from "../state/editor";
import { activeNoteRelPath, activeNotePath } from "../state/ui";
import { readDoc } from "../state/documents";

const StatusBar: Component = () => {
  const text = () => editorDoc() || readDoc(activeNotePath());
  const wordCount = () => {
    const m = text().trim().match(/\S+/g);
    return m ? m.length : 0;
  };
  const charCount = () => text().length;

  return (
    <div class="statusbar">
      <div class="statusbar__left">
        <span>{wordCount().toLocaleString()} words</span>
        <span>{charCount().toLocaleString()} characters</span>
      </div>
      <span class="statusbar__path">{activeNoteRelPath()}</span>
    </div>
  );
};

export default StatusBar;
