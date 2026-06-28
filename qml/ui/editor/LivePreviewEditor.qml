import QtQuick
import QtQuick.Controls
import HyperLinkNotes

// ── Native Obsidian-style Live Preview ──────────────────────────────────────
// One row per source line, in a VIRTUALIZED ListView (only the visible rows
// exist — that's what keeps scrolling smooth and stops the sidebar slide from
// re-laying-out the whole note). A row you're NOT on renders "clean" (markdown
// applied, markers gone); the row your cursor IS on becomes raw, editable text
// — exactly how Obsidian reveals the active line. No mode toggle, no browser.
//
// Same surface NoteEditor expects from the old editor:
//   text (in/out), edited(text), linkClicked(target), appendText(), focusEditor()
Item {
    id: root

    property string text: ""
    signal edited(string text)
    signal linkClicked(string target)

    property int activeIndex: -1      // source line that's currently raw/editable
    property int pendingCursor: 0     // caret position to drop when a row activates
    property bool _internal: false    // guard: our own writes shouldn't rebuild rows

    ListModel { id: lineModel }

    function loadFromText(t) {
        // Detach the model while bulk-filling so the ListView lays out ONCE at the
        // end instead of reacting to every per-line insert — that per-insert churn
        // was what made opening a long note crawl.
        if (listView) listView.model = null;
        lineModel.clear();
        var lines = (t || "").split("\n");
        for (var i = 0; i < lines.length; i++) lineModel.append({ "src": lines[i] });
        if (lineModel.count === 0) lineModel.append({ "src": "" });
        activeIndex = -1;
        if (listView) listView.model = lineModel;
    }
    function collect() {
        var a = [];
        for (var i = 0; i < lineModel.count; i++) a.push(lineModel.get(i).src);
        return a.join("\n");
    }

    onTextChanged: if (!_internal) loadFromText(text)
    onActiveIndexChanged: if (activeIndex >= 0)
        Qt.callLater(function () { listView.positionViewAtIndex(activeIndex, ListView.Contain); })

    // Width the rows wrap to. While the editor is being resized (sidebar slide or
    // drag, window resize) we FREEZE this so the rows don't re-wrap every frame —
    // that per-frame text re-layout was what made the panel motion drag. It snaps
    // to the final width ~90ms after the motion settles (one reflow, not 60).
    property real rowWidth: 0
    Component.onCompleted: rowWidth = width
    onWidthChanged: { if (rowWidth <= 0) rowWidth = width; else widthSettle.restart(); }
    Timer { id: widthSettle; interval: 90; onTriggered: root.rowWidth = root.width }

    Timer {
        id: syncTimer
        interval: 160
        onTriggered: {
            root._internal = true;
            root.text = root.collect();
            root._internal = false;
            root.edited(root.text);
        }
    }
    function scheduleSync() { syncTimer.restart(); }

    function activate(i, cursor) {
        root.pendingCursor = cursor === undefined ? lineModel.get(i).src.length : cursor;
        root.activeIndex = i;
    }
    function splitLine(i, pos) {
        var s = lineModel.get(i).src;
        lineModel.setProperty(i, "src", s.substring(0, pos));
        lineModel.insert(i + 1, { "src": s.substring(pos) });
        root.pendingCursor = 0;
        root.activeIndex = i + 1;
        scheduleSync();
    }
    function mergeUp(i) {
        if (i <= 0) return;
        var prev = lineModel.get(i - 1).src;
        lineModel.setProperty(i - 1, "src", prev + lineModel.get(i).src);
        lineModel.remove(i);
        root.pendingCursor = prev.length;
        root.activeIndex = i - 1;
        scheduleSync();
    }

    function appendText(t) {
        if (lineModel.count === 0) { loadFromText(t); scheduleSync(); return; }
        var parts = (t || "").split("\n");
        var last = lineModel.count - 1;
        lineModel.setProperty(last, "src", lineModel.get(last).src + parts[0]);
        for (var k = 1; k < parts.length; k++) lineModel.append({ "src": parts[k] });
        scheduleSync();
    }
    function focusEditor() { if (lineModel.count > 0) activate(lineModel.count - 1); }

    // ── Markdown helpers ────────────────────────────────────────────────────
    function headingLevel(s) { var m = s.match(/^(#{1,6})\s/); return m ? m[1].length : 0; }
    function headingText(s)  { return s.replace(/^#{1,6}\s+/, ""); }
    function headingSize(l)  { return [16, 30, 26, 22, 20, 18, 17][l] || 16; }

    // Does this line contain anything the rich-text renderer is needed for?
    // Plain prose (the common case) skips MarkdownText entirely → much cheaper.
    function needsRich(s) {
        return /[*_`~]/.test(s) || s.indexOf("[") !== -1
            || /^\s*([-*+]|\d+\.)\s/.test(s) || /^\s*>/.test(s);
    }

    // Turn [[wikilinks]] into clickable links the rich-text renderer understands.
    // [[Target]] or [[label|A|B]] → [label](hlink:<urlencoded target>). The
    // markdown link renderer then makes the label clickable; onLinkActivated
    // routes it back to the app. Regular [text](url) links pass through untouched.
    function mdLine(s) {
        return s.replace(/\[\[([^\]\n]+?)\]\]/g, function (_, inner) {
            var pipe = inner.indexOf("|");
            var label, target;
            if (pipe === -1) { label = inner.trim(); target = label; }
            else { label = inner.slice(0, pipe).trim(); target = (inner.slice(pipe + 1).split("|")[0] || label).trim(); }
            return "[" + label + "](hlink:" + encodeURIComponent(target) + ")";
        });
    }
    function openLink(href) {
        if (href.indexOf("hlink:") === 0) root.linkClicked(decodeURIComponent(href.substring(6)));
        else root.linkClicked(href);
    }

    // ── Raw (editable) row — instantiated only for the active line ──────────
    // `parent` is the inner Loader, which carries rowIndex / rowSrc.
    Component {
        id: editComp
        TextArea {
            id: field
            width: parent ? parent.width : 0
            wrapMode: TextArea.Wrap
            color: Theme.text
            font.family: "Segoe UI"
            font.pixelSize: 16
            selectionColor: Theme.accentSoftHi
            selectedTextColor: "#ffffff"
            background: null
            leftPadding: 0; rightPadding: 0; topPadding: 0; bottomPadding: 0

            Component.onCompleted: {
                text = parent.rowSrc;
                cursorPosition = Math.min(root.pendingCursor, text.length);
                forceActiveFocus();
            }
            onTextChanged: {
                if (text !== parent.rowSrc) {
                    lineModel.setProperty(parent.rowIndex, "src", text);
                    root.scheduleSync();
                }
            }
            Keys.onReturnPressed: (event) => { root.splitLine(parent.rowIndex, cursorPosition); event.accepted = true; }
            Keys.onPressed: (event) => {
                if (event.key === Qt.Key_Backspace && cursorPosition === 0
                        && selectionStart === selectionEnd && parent.rowIndex > 0) {
                    root.mergeUp(parent.rowIndex); event.accepted = true;
                } else if (event.key === Qt.Key_Up && cursorPosition === 0 && parent.rowIndex > 0) {
                    root.activate(parent.rowIndex - 1); event.accepted = true;
                } else if (event.key === Qt.Key_Down && cursorPosition === text.length
                        && parent.rowIndex < lineModel.count - 1) {
                    root.activate(parent.rowIndex + 1, 0); event.accepted = true;
                }
            }
        }
    }

    // ── Virtualized list of rows ────────────────────────────────────────────
    ListView {
        id: listView
        anchors.fill: parent
        model: lineModel
        clip: true
        spacing: 2
        cacheBuffer: 400                 // keep some off-screen rows warm for smooth scroll
        keyNavigationEnabled: false      // arrow keys belong to the active TextArea
        boundsBehavior: Flickable.StopAtBounds
        // No visible scrollbar (wheel/drag still scroll).
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AlwaysOff }

        delegate: Item {
            id: row
            required property int index
            required property string src
            width: root.rowWidth > 0 ? root.rowWidth : root.width
            implicitHeight: Math.max(row.active && editLoader.item
                                     ? editLoader.item.implicitHeight : view.implicitHeight, 24)

            property bool active: index === root.activeIndex
            property int level: root.headingLevel(src)
            property string body: level > 0 ? root.headingText(src) : src
            property bool rich: root.needsRich(body)
            property bool blank: src.trim().length === 0

            // Rendered (clean) view — ALWAYS present, so the row height is known
            // synchronously even while scrolling (that's what kills the scroll
            // glitch). Just hidden while this row is the one being edited.
            Text {
                id: view
                width: row.width
                visible: !row.active && !row.blank
                // Plain prose → cheap PlainText; only lines with real markdown or
                // links pay for the rich renderer.
                textFormat: row.rich ? Text.MarkdownText : Text.PlainText
                text: row.rich ? root.mdLine(row.body) : row.body
                wrapMode: Text.Wrap
                color: Theme.text                      // headings: normal colour, bigger/bold
                font.family: "Segoe UI"
                font.pixelSize: row.level > 0 ? root.headingSize(row.level) : 16
                font.bold: row.level > 0
            }

            // Editable raw view — only created for the active row.
            Loader {
                id: editLoader
                width: row.width
                active: row.active
                sourceComponent: editComp
                property int rowIndex: row.index
                property string rowSrc: row.src
            }

            MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                enabled: !row.active                   // let the TextArea own the mouse while editing
                property bool overLink: false
                cursorShape: overLink ? Qt.PointingHandCursor : Qt.IBeamCursor
                onPositionChanged: (m) => overLink = (view.visible && view.linkAt(m.x, m.y).length > 0)
                onClicked: (m) => {
                    var href = view.visible ? view.linkAt(m.x, m.y) : "";
                    if (href.length > 0) root.openLink(href);
                    else root.activate(row.index, row.src.length);
                }
            }
        }

        // Clickable empty space below the last line → edit the last line.
        footer: Item {
            width: listView.width
            height: 160
            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.IBeamCursor
                onClicked: if (lineModel.count > 0) root.activate(lineModel.count - 1)
            }
        }
    }
}
