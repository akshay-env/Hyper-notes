import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import HyperLinkNotes
import "../dialogs"
import "../../scripts/tree/refreshTree.js" as RefreshTree
import "../../scripts/editor/frontmatter.js" as FM
import "../../scripts/editor/buildContext.js" as BuildContext
import "../../scripts/editor/openLink.js" as OpenLink
import "../../scripts/file/openFileByPath.js" as OpenFile

ColumnLayout {
    id: root
    spacing: 16
    visible: window.activeNote !== null

    property string currentLoadedPath: ""

    // ── Exposed editor state (read by RightPanel / Outline / StatusBar) ───────
    // Live document text, word count, and the debounced-save status.
    property alias editorText: cmEditor.text
    readonly property int wordCount: {
        var t = cmEditor.text ? cmEditor.text.trim() : "";
        if (t.length === 0) return 0;
        var m = t.match(/\S+/g);
        return m ? m.length : 0;
    }
    // False only while the debounced save timer is pending (i.e. "Saving…").
    property bool saved: !saveTimer.running
    // Scroll the editor to a source line (used by the Outline panel's headings).
    function scrollToLine(i) { cmEditor.scrollToLine(i); }

    // ── In-note search (driven by the slide-down search bar in Main) ──────────
    readonly property int searchCount: cmEditor.searchCount
    readonly property int searchCurrent: cmEditor.searchCurrent
    function searchRun(q) { return cmEditor.runSearch(q); }
    function searchNext() { cmEditor.nextMatch(); }
    function searchPrev() { cmEditor.prevMatch(); }
    function searchClear() { cmEditor.clearSearch(); }

    // ── AI ───────────────────────────────────────────────────────────────────
    // Shared LLM client (set from Main) + transient ask state.
    property var llmService: null
    property string askError: ""
    property bool askExpanded: false   // collapsed → only the Ask button shows
    property string _typeQueue: ""     // buffered streamed text not yet "typed" in
    property bool _streamDone: false   // network stream ended; drain the queue then finish

    function submitAsk() {
        if (!llmService || llmService.busy) return;
        var q = askField.text.trim();
        if (q === "") return;
        root.askError = "";

        // Context = this note's ancestor chain (read from files, capped) + its
        // own live body. The parent is read from this note's frontmatter.
        var parsed = FM.parse(cmEditor.text);
        var currentTitle = (window.activeNote && window.activeNote.name)
                           ? window.activeNote.name.replace(/\.md$/i, "") : "Current note";
        var ctx = BuildContext.buildFromTitle(window, window.vaultFsRef, parsed.parent, 12000);
        if (parsed.body.trim().length > 0)
            ctx += (ctx ? "\n\n" : "") + "## " + currentTitle + "\n" + parsed.body.trim();

        // Append the question at the end; the answer streams in right after it.
        // (We append at the document end rather than at the cursor position.)
        cmEditor.appendText("\n> " + q + "\n\n");
        root._typeQueue = "";
        root._streamDone = false;

        llmService.ask(q, ctx.trim());
        askField.text = "";
    }

    Connections {
        target: root.llmService

        // Buffer streamed text; the typewriter timer reveals it at a steady pace.
        function onStreamChunk(delta) {
            root._typeQueue += delta;
            if (!typeTimer.running) typeTimer.start();
        }

        function onStreamFinished() {
            root._streamDone = true;
            if (!typeTimer.running) root._finishStream();
        }

        function onFailed(err) {
            typeTimer.stop();
            root._typeQueue = "";
            root._streamDone = false;
            root.askError = err;
            askErrorTimer.restart();
            root.askExpanded = true;   // open the bar so the error is visible
        }
    }

    // Typewriter — reveals the buffered answer at a brisk, readable pace (not an
    // instant paste). Speeds up when a backlog builds so long answers don't lag.
    Timer {
        id: typeTimer
        interval: 14
        repeat: true
        onTriggered: {
            if (root._typeQueue.length === 0) {
                typeTimer.stop();
                if (root._streamDone) root._finishStream();
                return;
            }
            var n = Math.max(1, Math.ceil(root._typeQueue.length / 55));
            var piece = root._typeQueue.substring(0, n);
            root._typeQueue = root._typeQueue.substring(n);
            cmEditor.appendText(piece);
        }
    }

    function _finishStream() {
        cmEditor.appendText("\n");
        root._streamDone = false;
        // The debounced saveTimer (on cmEditor.edited) persists the final text.
    }

    Timer { id: askErrorTimer; interval: 6000; onTriggered: root.askError = "" }
    Timer { id: askFocusTimer; interval: 230; onTriggered: askField.forceActiveFocus() }

    // Seed the pinned title field on load / note switch.
    function applyTitleState(name, path) {
        titleField.text = name;
        titleField.editingPath = path;
        titleField.editingOriginalName = name;
    }

    // Sync editor text fields when activeNote changes
    Connections {
        target: window
        function onActiveNoteChanged() {
            if (window.activeNote) {
                if (window.activeNote.path !== currentLoadedPath) {
                    var name = window.activeNote.name.replace(/\.md$/i, "");
                    cmEditor.text = window.activeNote.path ? vaultFs.readFile(window.activeNote.path) : (window.activeNote.content || "");
                    currentLoadedPath = window.activeNote.path;
                    root.applyTitleState(name, window.activeNote.path);
                }
            } else {
                cmEditor.text = "";
                currentLoadedPath = "";
                root.applyTitleState("", "");
            }
        }
    }

    // A rename repointed [[wikilinks]] across the vault. If the note open right
    // now was one of the rewritten files, reload it so the editor shows the new
    // link targets instead of stale ones (and doesn't save over the change).
    Connections {
        target: window.vaultFsRef
        function onLinksRepointed(changedPaths) {
            if (window.activeNote && window.activeNote.path
                    && changedPaths.indexOf(window.activeNote.path) !== -1) {
                cmEditor.text = window.vaultFsRef.readFile(window.activeNote.path);
            }
        }
    }

    // Pinned note title — stays at the top of the editor instead of riding as the
    // scrolling ListView header (which slid away and looked "cut out" on scroll).
    // The body (cmEditor) scrolls beneath it; applyTitleState() seeds it.
    NoteTitle {
        id: titleField
        Layout.fillWidth: true
        vaultFs: window.vaultFsRef

        onRenameRequested: (oldPath, newName) => {
            let newPath = vaultFs.renameFile(oldPath, newName);
            if (newPath !== "") {
                if (window.activeNote && window.activeNote.path === oldPath) {
                    window.activeNote.path = newPath;
                    window.activeNote.name = newName + (newName.endsWith(".md") || newName.endsWith(".txt") ? "" : ".md");
                    root.currentLoadedPath = newPath; // Prevent file reload on refresh
                    titleField.editingPath = newPath;
                    titleField.editingOriginalName = newName;
                    // Keep the open tab pointing at the renamed file
                    window.updateActiveTabLabel(newPath, newName);
                }
                RefreshTree.refreshTree(window, window.vaultFsRef);
            } else {
                titleField.text = titleField.editingOriginalName;
            }
        }

        onTitleAccepted: cmEditor.focusEditor()
    }

    // Native live-preview editor. Exposes text / edited / linkClicked /
    // appendText / focusEditor.
    LivePreviewEditor {
        id: cmEditor
        Layout.fillWidth: true
        Layout.fillHeight: true

        // Freeze text re-wrap during the sidebar open/close animation AND the
        // window maximize/restore animation, so those slides stay smooth; a manual
        // resize drag (both flags false) keeps reflowing live and instant.
        freezeWidth: window.sidebarAnimating || window.maximizing

        // Debounced save: edits (typed or AI-streamed) restart the timer; it
        // persists the live text once things go quiet.
        onEdited: (text) => saveTimer.restart()
        onLinkClicked: (target) => OpenLink.openLink(window, window.vaultFsRef, target)
        onOpenAllRequested: (targets) => OpenLink.openAllInTabs(window, window.vaultFsRef, targets)

        // "Create new note" from a multi-link menu: make a fresh note in this
        // note's folder, append it to the clicked link, save THIS note, then open
        // the new one for editing.
        onCreateNoteForLink: (lineIndex, linkStart, linkEnd) => {
            var vaultFs = window.vaultFsRef;
            if (!vaultFs) return;
            var parentPath = vaultFs.vaultPath;
            if (window.activeNote && window.activeNote.path) {
                var p = window.activeNote.path;
                var ls = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
                if (ls !== -1) parentPath = p.substring(0, ls);
            }
            if (vaultFs.createNote(parentPath, "Untitled")) {
                var newPath = vaultFs.getLastCreatedPath();
                var newTitle = newPath.replace(/^.*[\\/]/, "").replace(/\.md$/i, "");
                cmEditor.addTargetToLink(lineIndex, linkStart, linkEnd, newTitle);
                if (window.activeNote && window.activeNote.path)
                    vaultFs.saveFile(window.activeNote.path, cmEditor.text);
                RefreshTree.refreshTree(window, vaultFs);
                OpenFile.openFileByPath(window, newPath);
            }
        }
    }

    Timer {
        id: saveTimer
        interval: 400
        onTriggered: {
            if (window.activeNote && window.activeNote.path)
                window.vaultFsRef.saveFile(window.activeNote.path, cmEditor.text);
        }
    }

    // ── Ask AI (collapsible — only the Ask button shows until opened) ────────
    ColumnLayout {
        Layout.fillWidth: true
        spacing: 4

        Text {
            Layout.fillWidth: true
            horizontalAlignment: Text.AlignRight
            visible: root.askError !== ""
            text: root.askError
            color: Theme.danger
            font.pixelSize: 11
            font.family: "Segoe UI"
            wrapMode: Text.WordWrap
            maximumLineCount: 2
            elide: Text.ElideRight
        }

        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: 44

            Rectangle {
                id: askBar
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                height: 44
                // Collapsed = just the button (transparent shell); expanded fills
                // the full editor width. Width is driven by an animated `expansion`
                // factor (0→1) rather than animating width directly, so the
                // collapse/expand keeps its smooth slide while a PANEL RESIZE flows
                // through parent.width instantly (only `expansion` is animated).
                property real expansion: root.askExpanded ? 1 : 0
                Behavior on expansion { NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
                width: 78 + Math.max(0, parent.width - 78) * expansion
                radius: 10
                color: root.askExpanded ? Theme.surface : "transparent"
                border.color: root.askExpanded ? (askField.activeFocus ? Theme.accent : Theme.border)
                                               : "transparent"
                border.width: 1
                clip: true

                TextField {
                    id: askField
                    anchors.left: parent.left
                    anchors.leftMargin: 12
                    anchors.right: askBtnRect.left
                    anchors.rightMargin: 8
                    anchors.verticalCenter: parent.verticalCenter
                    enabled: root.askExpanded && !(root.llmService && root.llmService.busy)
                    placeholderText: (root.llmService && root.llmService.busy)
                                     ? "Thinking…"
                                     : "Ask AI about this note…"
                    placeholderTextColor: Theme.textFaint
                    color: Theme.text
                    font.pixelSize: 13
                    font.family: "Segoe UI"
                    selectionColor: Theme.accent
                    selectedTextColor: Theme.onAccent
                    background: null
                    leftPadding: 0
                    onAccepted: root.submitAsk()
                    Keys.onEscapePressed: root.askExpanded = false
                }

                Rectangle {
                    id: askBtnRect
                    anchors.right: parent.right
                    anchors.rightMargin: 6
                    anchors.verticalCenter: parent.verticalCenter
                    width: 64
                    height: 30
                    radius: 6
                    property bool busy: root.llmService && root.llmService.busy
                    color: askBtn.containsMouse ? Theme.accentHover : Theme.accent
                    Behavior on color { ColorAnimation { duration: Theme.animFast } }

                    Text {
                        anchors.centerIn: parent
                        text: askBtnRect.busy ? "…" : "Ask"
                        color: Theme.onAccent
                        font.pixelSize: 13
                        font.bold: true
                        font.family: "Segoe UI"
                    }

                    MouseArea {
                        id: askBtn
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            if (askBtnRect.busy) return;            // ignore while streaming
                            if (!root.askExpanded) {
                                root.askExpanded = true;            // maximize
                                askFocusTimer.restart();            // focus once expanded
                            } else if (askField.text.trim() !== "") {
                                root.submitAsk();                   // ask
                            } else {
                                root.askExpanded = false;           // empty → minimize
                            }
                        }
                    }
                }
            }
        }
    }
}
