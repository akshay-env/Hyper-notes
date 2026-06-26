import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import HyperLinkNotes
import "../dialogs"
import "../../scripts/tree/refreshTree.js" as RefreshTree
import "../../scripts/editor/frontmatter.js" as FM
import "../../scripts/editor/buildContext.js" as BuildContext

ColumnLayout {
    id: root
    spacing: 16
    visible: window.activeNote !== null

    property string currentLoadedPath: ""

    // ── AI ───────────────────────────────────────────────────────────────────
    // Shared LLM client (set from Main) + transient ask state.
    property var llmService: null
    property string askError: ""
    property bool askExpanded: false   // collapsed → only the Ask button shows
    property int _streamPos: 0         // where the streamed answer is being written

    function submitAsk() {
        if (!llmService || llmService.busy) return;
        var q = askField.text.trim();
        if (q === "") return;
        root.askError = "";

        // Context = this note's ancestor chain (read from files, capped) + its
        // own live body. The parent is read from this note's frontmatter.
        var parsed = FM.parse(noteBody.text);
        var currentTitle = (window.activeNote && window.activeNote.name)
                           ? window.activeNote.name.replace(/\.md$/i, "") : "Current note";
        var ctx = BuildContext.buildFromTitle(window, window.vaultFsRef, parsed.parent, 12000);
        if (parsed.body.trim().length > 0)
            ctx += (ctx ? "\n\n" : "") + "## " + currentTitle + "\n" + parsed.body.trim();

        // Drop the question into the note; the answer streams in right after it.
        var ta = noteBody.textArea;
        var p0 = ta.cursorPosition;
        var qBlock = "\n> " + q + "\n\n";
        ta.insert(p0, qBlock);
        root._streamPos = p0 + qBlock.length;
        ta.cursorPosition = root._streamPos;

        llmService.ask(q, ctx.trim());
        askField.text = "";
    }

    Connections {
        target: root.llmService

        function onStreamChunk(delta) {
            var ta = noteBody.textArea;
            var pos = Math.min(root._streamPos, ta.length);
            ta.insert(pos, delta);
            root._streamPos = pos + delta.length;
            ta.cursorPosition = root._streamPos;   // keep the caret riding the text
        }

        function onStreamFinished() {
            var ta = noteBody.textArea;
            ta.insert(Math.min(root._streamPos, ta.length), "\n");
            if (window.activeNote && window.activeNote.path)
                window.vaultFsRef.saveFile(window.activeNote.path, noteBody.text);
        }

        function onFailed(err) {
            root.askError = err;
            askErrorTimer.restart();
            root.askExpanded = true;   // open the bar so the error is visible
        }
    }

    Timer { id: askErrorTimer; interval: 6000; onTriggered: root.askError = "" }
    Timer { id: askFocusTimer; interval: 230; onTriggered: askField.forceActiveFocus() }

    // Collapse the (empty) Ask bar when the editing cursor returns to the note.
    Connections {
        target: noteBody.textArea
        function onActiveFocusChanged() {
            if (noteBody.textArea.activeFocus && root.askExpanded
                    && askField.text.trim() === ""
                    && !(root.llmService && root.llmService.busy))
                root.askExpanded = false;
        }
    }

    // Sync editor text fields when activeNote changes
    Connections {
        target: window
        function onActiveNoteChanged() {
            if (window.activeNote) {
                if (window.activeNote.path !== currentLoadedPath) {
                    noteTitle.text = window.activeNote.name.replace(/\.md$/i, "");
                    noteBody.text = window.activeNote.path ? vaultFs.readFile(window.activeNote.path) : (window.activeNote.content || "");
                    currentLoadedPath = window.activeNote.path;
                    noteTitle.editingPath = window.activeNote.path;
                    noteTitle.editingOriginalName = window.activeNote.name.replace(/\.md$/i, "");
                }
            } else {
                noteTitle.text = "";
                noteBody.text = "";
                currentLoadedPath = "";
                noteTitle.editingPath = "";
                noteTitle.editingOriginalName = "";
            }
        }
    }

    NoteTitle {
        id: noteTitle
        Layout.fillWidth: true
        vaultFs: window.vaultFsRef

        onRenameRequested: (oldPath, newName) => {
            let newPath = vaultFs.renameFile(oldPath, newName);
            if (newPath !== "") {
                if (window.activeNote && window.activeNote.path === oldPath) {
                    window.activeNote.path = newPath;
                    window.activeNote.name = newName + (newName.endsWith(".md") || newName.endsWith(".txt") ? "" : ".md");
                    root.currentLoadedPath = newPath; // Prevent file reload on refresh
                    noteTitle.editingPath = newPath;
                    noteTitle.editingOriginalName = newName;
                    // Keep the open tab pointing at the renamed file
                    window.updateActiveTabLabel(newPath, newName);
                }
                RefreshTree.refreshTree(window, window.vaultFsRef);
            } else {
                noteTitle.text = noteTitle.editingOriginalName;
            }
        }

        onTitleAccepted: {
            noteBody.textArea.forceActiveFocus();
        }
    }

    NoteBody {
        id: noteBody
        Layout.fillWidth: true
        Layout.fillHeight: true
        vaultFs: window.vaultFsRef

        onBodyTextChanged: (text) => {
            if (window.activeNote && window.activeNote.path) {
                vaultFs.saveFile(window.activeNote.path, text);
            }
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
                // Collapsed = just the button (transparent shell); expanded slides
                // the field out to the left, filling the full editor width.
                width: root.askExpanded ? parent.width : 78
                radius: 10
                color: root.askExpanded ? Theme.surface : "transparent"
                border.color: root.askExpanded ? (askField.activeFocus ? Theme.accent : Theme.border)
                                               : "transparent"
                border.width: 1
                clip: true

                Behavior on width { NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }

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
