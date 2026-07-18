// Bottom status bar (StatusBar.qml, height 26): word count (left) + the note's
// vault-relative path (right). Both follow the active note live.
import type { Component } from "solid-js";
import { DocIcon } from "./icons/Icons";
import { editorDoc } from "../state/editor";
import { activeNoteRelPath, activeNotePath } from "../state/ui";
import { readDoc } from "../state/documents";

const StatusBar: Component = () => {
  const wordCount = () => {
    const txt = editorDoc() || readDoc(activeNotePath());
    const m = txt.trim().match(/\S+/g);
    return m ? m.length : 0;
  };

  return (
    <div class="statusbar">
      <div class="statusbar__left">
        <DocIcon />
        <span>{wordCount().toLocaleString()} words</span>
      </div>
      <span class="statusbar__path">{activeNoteRelPath()}</span>
    </div>
  );
};

export default StatusBar;
