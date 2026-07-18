// Mounts the CM6 live-preview editor and swaps its document as the active note
// changes. One EditorView is kept for the life of the app; on a note change we
// save the outgoing note's buffer (flushEditor), then setState the incoming
// note's text. An updateListener mirrors every edit into editorDoc so the Outline
// + StatusBar always reflect what's on screen. The store key for each opened note
// is ensured so its edits persist across swaps.
import { type Component, onMount, onCleanup, createEffect } from "solid-js";
import { EditorView } from "@codemirror/view";
import { createEditorState, applyEditorMode } from "../../editor/createEditorState";
import {
  setEditorView,
  setEditorDoc,
  setLoadedPath,
  flushEditor,
  editorMode,
} from "../../state/editor";
import { activeNotePath, renameActiveNote } from "../../state/ui";
import { readDoc, createDoc } from "../../state/documents";

// Filename (no extension) shown as the inline title; "" for a blank/graph tab.
const titleFor = (path: string) => (path ? (path.split("/").pop() || "").replace(/\.md$/i, "") : "");
// Commit an inline-title edit as a rename; returns false when rejected so the
// widget can restore the old name.
const onTitleRename = (name: string) => renameActiveNote(name) !== null;

const Editor: Component = () => {
  let host: HTMLDivElement | undefined;
  let view: EditorView | undefined;

  // Mirror every edit into the editorDoc signal (drives Outline + StatusBar).
  const syncListener = EditorView.updateListener.of((u) => {
    if (u.docChanged) setEditorDoc(u.state.doc.toString());
  });

  const load = (path: string) => {
    createDoc(path); // ensure a doc entry exists so this note's edits persist
    setLoadedPath(path);
    view!.setState(createEditorState(readDoc(path), [syncListener], editorMode(), titleFor(path), onTitleRename));
    setEditorDoc(view!.state.doc.toString());
  };

  onMount(() => {
    if (!host) return;
    let loaded = activeNotePath();
    createDoc(loaded);
    view = new EditorView({
      state: createEditorState(readDoc(loaded), [syncListener], editorMode(), titleFor(loaded), onTitleRename),
      parent: host,
    });
    setEditorView(view);
    setLoadedPath(loaded);
    setEditorDoc(view.state.doc.toString());

    // Swap documents when the active note changes; persist the outgoing buffer.
    createEffect(() => {
      const path = activeNotePath();
      if (path === loaded) return;
      flushEditor();
      loaded = path;
      load(path);
    });

    // Reflect mode changes (Live / Source / Reading) into the running editor.
    createEffect(() => {
      const mode = editorMode();
      if (view) applyEditorMode(view, mode);
    });
  });

  onCleanup(() => {
    view?.destroy();
    setEditorView(null);
  });

  return <div class="editor-host" ref={host} />;
};

export default Editor;
