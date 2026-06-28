import QtQuick
import QtQuick.Controls
import HyperLinkNotes
import "../../scripts/editor/createNoteFromSelection.js" as CreateNoteScript
import "../../scripts/editor/wrapSelectionInLink.js" as WrapSelection
import "../../scripts/editor/openLink.js" as OpenLink
import "../../scripts/editor/branchNote.js" as BranchNote
// Theme is available via the HyperLinkNotes import above

ScrollView {
    id: scrollView
    clip: true
    // Hide both scrollbars; wheel/touch scrolling still works via the flickable.
    ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
    ScrollBar.vertical.policy: ScrollBar.AlwaysOff
    
    property alias text: noteBody.text
    property var vaultFs: null

    signal bodyTextChanged(string text)

    property alias textArea: noteBody

    // Targets shown in the multi-link hover card, and whether the cursor is over
    // a multi-link label (drives the pointing-hand cursor).
    property var hoverCardTargets: []
    property bool overLink: false

    // Captured at right-click time for the note-picker authoring flow.
    // _ctxMode: "wrap" (turn a selection into a link) | "append" (extend a link).
    property string _ctxMode: "none"
    property int _wrapStart: 0
    property int _wrapEnd: 0
    property string _wrapLabel: ""
    property int _linkStart: 0
    property int _linkEnd: 0
    property string _linkInner: ""

    TextArea {
        id: noteBody
        width: scrollView.width
        readOnly: false
        placeholderText: "Start writing..."
        placeholderTextColor: Theme.textFaint
        color: Theme.text
        font.pixelSize: 16
        font.family: "Segoe UI"
        background: null
        selectByMouse: true
        selectionColor: Theme.accentSoftHi
        selectedTextColor: "#ffffff"
        wrapMode: TextEdit.WrapAtWordBoundaryOrAnywhere
        leftPadding: 0
        topPadding: 0

        onTextChanged: {
            if (activeFocus) {
                scrollView.bodyTextChanged(text);
            }
        }

        // Kill the native style's built-in edit menu (Undo/Cut/Copy/…) that Qt 6.9+
        // adds to TextArea — we provide our own below.
        ContextMenu.menu: null

        // Right-click / context-menu key → our own menu. `position` is in
        // noteBody's coordinates.
        ContextMenu.onRequested: (position) => {
            let linkInfo = OpenLink.linkRangeAt(noteBody, position.x, position.y);
            if (linkInfo) {
                scrollView._ctxMode = "append";
                scrollView._linkStart = linkInfo.start;
                scrollView._linkEnd = linkInfo.end;
                scrollView._linkInner = linkInfo.inner;
                editorMenu.popupAt(position.x, position.y);
            } else if (noteBody.selectedText.length > 0) {
                scrollView._ctxMode = "wrap";
                scrollView._wrapStart = noteBody.selectionStart;
                scrollView._wrapEnd = noteBody.selectionEnd;
                scrollView._wrapLabel = noteBody.selectedText;
                editorMenu.popupAt(position.x, position.y);
            }
        }

        MarkdownHighlighter {
            document: noteBody.textDocument
            cursorPosition: noteBody.cursorPosition
            linkColor: Theme.accent
        }

        MouseArea {
            id: bodyMouse
            anchors.fill: parent
            acceptedButtons: Qt.LeftButton   // right-click is handled by ContextMenu.onRequested above
            hoverEnabled: true
            cursorShape: scrollView.overLink ? Qt.PointingHandCursor : Qt.IBeamCursor

            onPressed: (mouse) => {
                // A single click directly on a [[link]]'s label jumps to that note
                // (the first target for a multi-link; the hover card has the rest).
                // If the click missed the glyphs (e.g. empty margin past the line),
                // fall through so it places the cursor instead.
                let opened = OpenLink.checkAndOpenLink(window, scrollView.vaultFs, noteBody, mouse.x, mouse.y);
                if (opened) linkCard.close();
                mouse.accepted = opened;
            }

            // Hover: show the preview card while the cursor is over a link label.
            onPositionChanged: (mouse) => {
                if (pressed) return;
                let info = OpenLink.hoverLinkAt(noteBody, mouse.x, mouse.y);
                if (info) {
                    scrollView.overLink = true;
                    scrollView.hoverCardTargets = info.targets;
                    linkCard.x = info.x;
                    linkCard.y = info.y + info.height + 2;
                    hideCardTimer.stop();
                    if (!linkCard.visible) linkCard.open();
                } else {
                    scrollView.overLink = false;
                    if (!cardHover.hovered) hideCardTimer.restart();
                }
            }

            onExited: {
                scrollView.overLink = false;
                if (!cardHover.hovered) hideCardTimer.restart();
            }
        }

        // Closes the hover card shortly after the cursor leaves both the link and
        // the card itself (the short delay lets the cursor travel into the card).
        Timer {
            id: hideCardTimer
            interval: 200
            onTriggered: linkCard.close()
        }

        // ── Multi-link hover preview card ────────────────────────────────────
        Popup {
            id: linkCard
            parent: noteBody
            width: 222          // explicit — content rows bind to cardCol.width, which
            padding: 6          // the Popup derives from this; without it the size collapses to ~0
            closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

            background: Rectangle {
                color: Theme.surface2
                border.color: Theme.border
                border.width: 1
                radius: 8
            }

            contentItem: Column {
                id: cardCol
                width: 210
                spacing: 2

                HoverHandler {
                    id: cardHover
                    onHoveredChanged: hovered ? hideCardTimer.stop() : hideCardTimer.restart()
                }

                Repeater {
                    model: scrollView.hoverCardTargets

                    delegate: Rectangle {
                        width: cardCol.width
                        height: 30
                        radius: 5
                        color: rowMouse.containsMouse ? Theme.elevated : "transparent"
                        Behavior on color { ColorAnimation { duration: Theme.animFast } }

                        Row {
                            anchors.fill: parent
                            anchors.leftMargin: 8
                            anchors.rightMargin: 8
                            spacing: 6

                            Text {
                                width: parent.width - 18
                                anchors.verticalCenter: parent.verticalCenter
                                text: modelData
                                color: rowMouse.containsMouse ? Theme.text : Theme.textDim
                                font.pixelSize: 12
                                font.family: "Segoe UI"
                                elide: Text.ElideRight
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                text: "›"
                                color: Theme.accent
                                font.pixelSize: 15
                                visible: rowMouse.containsMouse
                            }
                        }

                        MouseArea {
                            id: rowMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: {
                                OpenLink.openLink(window, scrollView.vaultFs, modelData);
                                linkCard.close();
                            }
                        }
                    }
                }

                Rectangle {
                    width: cardCol.width
                    height: 1
                    color: Theme.divider
                    visible: scrollView.hoverCardTargets.length > 1
                }

                Rectangle {
                    width: cardCol.width
                    height: 30
                    radius: 5
                    visible: scrollView.hoverCardTargets.length > 1
                    color: allMouse.containsMouse ? Theme.accentSoft : "transparent"
                    Behavior on color { ColorAnimation { duration: Theme.animFast } }

                    Text {
                        anchors.left: parent.left
                        anchors.leftMargin: 8
                        anchors.verticalCenter: parent.verticalCenter
                        text: "Open all in tabs"
                        color: Theme.accent
                        font.pixelSize: 12
                        font.bold: true
                        font.family: "Segoe UI"
                    }

                    MouseArea {
                        id: allMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: {
                            OpenLink.openAllInTabs(window, scrollView.vaultFs, scrollView.hoverCardTargets);
                            linkCard.close();
                        }
                    }
                }
            }
        }
        
        Keys.onPressed: (event) => {
            if (event.key === Qt.Key_BracketLeft && noteBody.selectedText.length > 0) {
                WrapSelection.wrapSelection(noteBody);
                event.accepted = true;
            }
        }
        
        // Editor context menu (custom Popup, theme-controlled & compact).
        Popup {
            id: editorMenu
            padding: 5
            closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

            function popupAt(px, py) { x = px; y = py; open(); }

            background: Rectangle {
                color: Theme.surface2
                border.color: Theme.border
                border.width: 1
                radius: 8
            }

            component MenuRow: Rectangle {
                property alias label: rowLabel.text
                signal triggered()
                width: 196
                height: 30
                radius: 5
                color: rowArea.containsMouse ? Theme.elevated : "transparent"
                Behavior on color { ColorAnimation { duration: Theme.animFast } }
                Text {
                    id: rowLabel
                    anchors.left: parent.left
                    anchors.leftMargin: 10
                    anchors.verticalCenter: parent.verticalCenter
                    color: rowArea.containsMouse ? Theme.text : Theme.textDim
                    font.pixelSize: 13
                    font.family: "Segoe UI"
                }
                MouseArea {
                    id: rowArea
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: parent.triggered()
                }
            }

            contentItem: Column {
                spacing: 2

                MenuRow {
                    label: scrollView._ctxMode === "append" ? "Add notes to link…" : "Link to notes…"
                    onTriggered: {
                        editorMenu.close();
                        notePicker.headerText = scrollView._ctxMode === "append" ? "Add notes to link" : "Link to notes";
                        notePicker.excludePath = window.activeNote && window.activeNote.path ? window.activeNote.path : "";
                        notePicker.openPicker();
                    }
                }

                MenuRow {
                    label: "Branch into new note"
                    visible: scrollView._ctxMode === "wrap"
                    onTriggered: {
                        editorMenu.close();
                        BranchNote.branchFromSelection(window, scrollView.vaultFs, noteBody);
                    }
                }

                MenuRow {
                    label: "Create new note"
                    visible: scrollView._ctxMode === "wrap"
                    onTriggered: {
                        editorMenu.close();
                        CreateNoteScript.createNote(window, scrollView.vaultFs, noteBody);
                    }
                }
            }
        }

        // Note picker — turns the captured selection/link into [[label|A|B|…]].
        NotePicker {
            id: notePicker
            onPicked: (targets) => {
                if (scrollView._ctxMode === "wrap") {
                    let inner = scrollView._wrapLabel + "|" + targets.join("|");
                    let s = scrollView._wrapStart;
                    noteBody.remove(s, scrollView._wrapEnd);
                    noteBody.insert(s, "[[" + inner + "]]");
                    noteBody.cursorPosition = s + inner.length + 4;
                } else if (scrollView._ctxMode === "append") {
                    let parsed = OpenLink.parseInner(scrollView._linkInner);
                    let merged = parsed.targets.slice();
                    for (let i = 0; i < targets.length; i++)
                        if (merged.indexOf(targets[i]) === -1) merged.push(targets[i]);
                    let inner = parsed.label + "|" + merged.join("|");
                    let s = scrollView._linkStart;
                    noteBody.remove(s, scrollView._linkEnd);
                    noteBody.insert(s, "[[" + inner + "]]");
                    noteBody.cursorPosition = s + inner.length + 4;
                }
                // Programmatic edits don't always fire onTextChanged with focus, so
                // push the save explicitly.
                scrollView.bodyTextChanged(noteBody.text);
            }
        }
    }
}
