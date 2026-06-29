import QtQuick
import QtQuick.Controls
import HyperLinkNotes
import "../components"

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
    signal linkClicked(string target)                                   // open one note (current tab)
    signal openAllRequested(var targets)                                // open every linked note in new tabs
    signal createNoteForLink(int lineIndex, int linkStart, int linkEnd) // make a new note + add it to this link

    property int activeIndex: -1      // source line that's currently raw/editable
    property int pendingCursor: 0     // caret position to drop when a row activates
    property bool _internal: false    // guard: our own writes shouldn't rebuild rows

    // ── In-note search ──────────────────────────────────────────────────────
    // Matches found in the raw source: [{ line, start, len }]. The CURRENT match is
    // shown exactly highlighted — its line is activated (raw) and the match text is
    // selected — without stealing focus from the search field (persistentSelection).
    property var searchMatches: []
    property int searchCurrent: -1
    readonly property int searchCount: searchMatches.length
    property int pendingSelStart: -1  // selection to apply when a row activates
    property int pendingSelLen: 0
    property bool _searchActivating: false  // suppress the focus-grab for search jumps
    property var _activeField: null   // the live editable TextArea (if any)

    // Header that scrolls WITH the document (the note title lives here), so the
    // title isn't pinned above a separately-scrolling body — title + body move as
    // one piece. The host (NoteEditor) supplies the component; headerItem exposes
    // the live instance so the host can seed/update the title text.
    property Component headerComponent: null
    readonly property Item headerItem: listView.headerItem

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
        if (listView) {
            listView.model = lineModel;
            // Re-attaching the model leaves the header (the note title) parked below
            // a phantom gap; snap the view back to the very top so the title sits
            // flush under the toolbar.
            Qt.callLater(function () { if (listView) listView.positionViewAtBeginning(); });
        }
    }
    function collect() {
        var a = [];
        for (var i = 0; i < lineModel.count; i++) a.push(lineModel.get(i).src);
        return a.join("\n");
    }

    onTextChanged: if (!_internal) loadFromText(text)
    onActiveIndexChanged: if (activeIndex >= 0)
        Qt.callLater(function () { listView.positionViewAtIndex(activeIndex, ListView.Contain); })

    // Rows wrap to the LIVE editor width, so a sidebar DRAG or window resize
    // re-flows text instantly (no debounce). The one exception is the sidebar
    // open/close ANIMATION: `freezeWidth` (raised by the host for the ~300ms slide)
    // pins the wrap width so the panel glides smoothly, then reflows once at the
    // end. Drag stays instant; the toggle stays smooth — neither steals from the
    // other.
    property bool freezeWidth: false
    property real rowWidth: 0
    Component.onCompleted: rowWidth = width
    onWidthChanged: {
        if (rowWidth <= 0) { rowWidth = width; return; }
        if (freezeWidth) widthSettle.restart();   // animating → snap once motion settles
        else rowWidth = width;                     // drag / window resize → track live
    }
    onFreezeWidthChanged: if (!freezeWidth) rowWidth = width;   // animation ended → reflow now
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

    // Scroll a given source line to the top of the view (used by the Outline panel).
    // Source-line indices map 1:1 to lineModel rows, so this targets the heading row.
    function scrollToLine(line) {
        if (line < 0 || line >= lineModel.count) return;
        listView.positionViewAtIndex(line, ListView.Beginning);
    }

    // ── In-note search ───────────────────────────────────────────────────────
    // Scan every source line for the (case-insensitive) query, collect all hits,
    // and jump to the first. Returns the match count.
    function runSearch(q) {
        var matches = [];
        var needle = (q || "").toLowerCase();
        if (needle.length > 0) {
            for (var i = 0; i < lineModel.count; i++) {
                var hay = lineModel.get(i).src.toLowerCase();
                var from = 0, idx;
                while ((idx = hay.indexOf(needle, from)) !== -1) {
                    matches.push({ "line": i, "start": idx, "len": needle.length });
                    from = idx + needle.length;
                }
            }
        }
        searchMatches = matches;
        searchCurrent = matches.length > 0 ? 0 : -1;
        if (searchCurrent >= 0) gotoMatch(0);
        return matches.length;
    }
    function gotoMatch(i) {
        if (i < 0 || i >= searchMatches.length) return;
        searchCurrent = i;
        var m = searchMatches[i];
        // Same line already open? just move the selection. Otherwise activate that
        // line (which also scrolls it into view) and select on creation.
        if (root.activeIndex === m.line && root._activeField) {
            root._activeField.select(m.start, m.start + m.len);
            Qt.callLater(function () { listView.positionViewAtIndex(m.line, ListView.Contain); });
        } else {
            root.pendingSelStart = m.start;
            root.pendingSelLen = m.len;
            root._searchActivating = true;   // don't yank focus off the search field
            root.activeIndex = m.line;
        }
    }
    function nextMatch() { if (searchMatches.length) gotoMatch((searchCurrent + 1) % searchMatches.length); }
    function prevMatch() { if (searchMatches.length) gotoMatch((searchCurrent - 1 + searchMatches.length) % searchMatches.length); }
    function clearSearch() {
        var wasOnMatch = searchCurrent >= 0;
        searchMatches = []; searchCurrent = -1;
        pendingSelStart = -1; pendingSelLen = 0; _searchActivating = false;
        if (root._activeField) root._activeField.deselect();
        if (wasOnMatch) root.activeIndex = -1;   // re-render the line search had opened
    }

    // ── Markdown helpers ────────────────────────────────────────────────────
    // A thematic break: a line of 3+ matching -, * or _ (e.g. ---, ***, - - -).
    // Won't match a list bullet ("- item") — that needs 2+ MORE of the same char.
    function isHr(s) { return /^\s*([-_*])(?:\s*\1){2,}\s*$/.test(s); }

    // Parse a list item → { cols, marker, ordered, content } or null. `cols` is the
    // leading-indent width (tab = 4) used to nest visually. The marker + indent are
    // stripped so the content renders as clean inline markdown — rendering the raw
    // "    - text" per line would make Qt's markdown treat the 4-space indent as a
    // CODE BLOCK (the bug that broke every nested bullet).
    function listInfo(s) {
        var m = s.match(/^([ \t]*)([-*+]|\d+[.)])[ \t]+(.*)$/);
        if (!m) return null;
        var ws = m[1], cols = 0;
        for (var i = 0; i < ws.length; i++) cols += (ws.charAt(i) === '\t' ? 4 : 1);
        return { "cols": cols, "marker": m[2], "ordered": /\d/.test(m[2]), "content": m[3] };
    }
    function headingLevel(s) { var m = s.match(/^(#{1,6})\s/); return m ? m[1].length : 0; }
    function headingText(s)  { return s.replace(/^#{1,6}\s+/, ""); }
    function headingSize(l)  { return [16, 30, 26, 22, 20, 18, 17][l] || 16; }

    // Does this line contain anything the rich-text renderer is needed for?
    // Plain prose (the common case) skips MarkdownText entirely → much cheaper.
    function needsRich(s) {
        return /[*_`~]/.test(s) || s.indexOf("[") !== -1
            || /^\s*([-*+]|\d+\.)\s/.test(s) || /^\s*>/.test(s);
    }

    // Every destination of a [[…]] inner. For [[label|A|B]] that's [label, A, B]
    // — the displayed label IS itself an openable destination, not just display
    // text. Deduplicated, order preserved.
    function linkDests(inner) {
        var parts = inner.split("|").map(function (t) { return t.trim(); })
                                    .filter(function (t) { return t.length > 0; });
        var seen = {}, out = [];
        for (var i = 0; i < parts.length; i++)
            if (!seen[parts[i]]) { seen[parts[i]] = true; out.push(parts[i]); }
        return out;
    }

    // Turn [[wikilinks]] into clickable links the rich-text renderer understands.
    // Labeled [[label|…]] → [label](hlinkm:<encDest…>) (every destination, incl.
    // the label, rides in the href; click → menu). Bare [[Note]] →
    // [Note](hlink:<encNote>) (click → open directly). Destinations are
    // url-encoded with manual ( ) escaping (encodeURIComponent leaves parens raw
    // and they'd close the (url) early); '|' separates them.
    function mdLine(s) {
        return s.replace(/\[\[([^\]\n]+?)\]\]/g, function (_, inner) {
            var hasLabel = inner.indexOf("|") !== -1;
            var dests = linkDests(inner);
            var enc = dests.map(function (t) {
                return encodeURIComponent(t).replace(/\(/g, "%28").replace(/\)/g, "%29");
            }).join("|");
            var label = hasLabel ? inner.slice(0, inner.indexOf("|")).trim() : (dests[0] || "");
            return "[" + label + "](" + (hasLabel ? "hlinkm:" : "hlink:") + enc + ")";
        });
    }

    // A rendered link was clicked. Bare [[Note]] → open it. Labeled [[label|…]] →
    // action menu (label + targets, ALL openable) anchored at (x, y).
    function handleLink(href, lineIndex, x, y) {
        var isMenu = href.indexOf("hlinkm:") === 0;
        var isLink = href.indexOf("hlink:") === 0;
        if (!isMenu && !isLink) { root.linkClicked(href); return; }   // external [text](url)
        var dests = href.substring(isMenu ? 7 : 6).split("|").map(function (t) { return decodeURIComponent(t); });
        if (!isMenu) { root.linkClicked(dests[0]); return; }          // bare link → open

        // Find this labeled link's char range in the source line so "Create new
        // note" can append to it (match the [[…]] with the same destinations).
        var src = lineModel.get(lineIndex).src;
        var re = /\[\[([^\]\n]+?)\]\]/g, m, start = -1, end = -1, key = dests.join("|");
        while ((m = re.exec(src)) !== null) {
            if (m[1].indexOf("|") !== -1 && linkDests(m[1]).join("|") === key) {
                start = m.index; end = m.index + m[0].length; break;
            }
        }
        linkMenu.openFor(dests, lineIndex, start, end, x, y);
    }

    // Append a freshly-created note to an existing [[label|…]] link in the source.
    function addTargetToLink(lineIndex, linkStart, linkEnd, newTitle) {
        if (lineIndex < 0 || linkStart < 0 || !newTitle) return;
        var src = lineModel.get(lineIndex).src;
        var inner = src.substring(linkStart, linkEnd).replace(/^\[\[/, "").replace(/\]\]$/, "");
        lineModel.setProperty(lineIndex, "src",
            src.substring(0, linkStart) + "[[" + inner + "|" + newTitle + "]]" + src.substring(linkEnd));
        syncNow();
    }
    // Immediate (non-debounced) flush — used before switching notes so the edit
    // isn't lost when the new note replaces the document.
    function syncNow() {
        root._internal = true;
        root.text = root.collect();
        root._internal = false;
        root.edited(root.text);
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
            persistentSelection: true   // keep the search highlight visible w/o focus

            Component.onCompleted: {
                text = parent.rowSrc;
                if (root.pendingSelLen > 0) {
                    // Activated by search: select the matched text exactly.
                    var a = Math.min(root.pendingSelStart, text.length);
                    var b = Math.min(root.pendingSelStart + root.pendingSelLen, text.length);
                    cursorPosition = b;
                    select(a, b);
                    root.pendingSelLen = 0;
                } else {
                    cursorPosition = Math.min(root.pendingCursor, text.length);
                }
                root._activeField = field;
                // Search jumps keep focus on the search field; normal edits take it.
                if (root._searchActivating) root._searchActivating = false;
                else forceActiveFocus();
            }
            Component.onDestruction: { if (root._activeField === field) root._activeField = null; }
            onTextChanged: {
                if (text !== parent.rowSrc) {
                    lineModel.setProperty(parent.rowIndex, "src", text);
                    root.scheduleSync();
                }
            }
            Keys.onReturnPressed: (event) => { root.splitLine(parent.rowIndex, cursorPosition); event.accepted = true; }
            Keys.onPressed: (event) => {
                // Cross to the adjacent row only when the caret is on the FIRST
                // (Up) or LAST (Down) VISUAL line of this field — measured from the
                // cursor rectangle, not cursorPosition. cursorPosition===0/length
                // broke on wrapped lines (caret stuck mid-last-line couldn't go
                // down) and forced a wasted keypress on single-line rows. Shift =
                // selecting, so let the field keep the key.
                var atTop = field.cursorRectangle.y <= 1;
                var atBottom = field.cursorRectangle.y + field.cursorRectangle.height >= field.contentHeight - 1;
                var noShift = (event.modifiers & Qt.ShiftModifier) === 0;
                if (event.key === Qt.Key_Backspace && cursorPosition === 0
                        && selectionStart === selectionEnd && parent.rowIndex > 0) {
                    root.mergeUp(parent.rowIndex); event.accepted = true;
                } else if (event.key === Qt.Key_Up && noShift && atTop && parent.rowIndex > 0) {
                    root.activate(parent.rowIndex - 1); event.accepted = true;
                } else if (event.key === Qt.Key_Down && noShift && atBottom
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
        // Smooth scroll: recycle delegates instead of destroying/recreating them
        // (no markdown re-parse on every row that scrolls in), and keep a LARGE band
        // of off-screen rows pre-built. The big buffer is what stops the "pull
        // back / pull down" jitter: rows have VARIABLE height (headings, wrapped
        // lines, list items), and a virtualized ListView re-estimates contentHeight
        // as each new row realizes. Realizing them well off-screen lets their
        // rich-text height settle in the cache, so the view isn't correcting its
        // own height in the VISIBLE area mid-flick. A typical note fits entirely in
        // the buffer → effectively non-virtualized → no estimation, no jitter.
        reuseItems: true
        // Big enough that a typical note realizes ENTIRELY (well past the visible
        // band), so the view never re-estimates its own contentHeight mid-scroll —
        // that re-estimation was the residual scroll jitter. Long notes still
        // virtualize beyond this.
        cacheBuffer: 15000
        // Snap scrolling to whole pixels so glyphs don't re-rasterize at sub-pixel
        // offsets every frame — that shimmer was the remaining scroll "flicker".
        pixelAligned: true
        keyNavigationEnabled: false      // arrow keys belong to the active TextArea
        boundsBehavior: Flickable.StopAtBounds
        // Title (or any host-supplied header) scrolls with the body as one piece.
        header: root.headerComponent

        delegate: Item {
            id: row
            required property int index
            required property string src
            width: root.rowWidth > 0 ? root.rowWidth : root.width
            // Rounded so rows never sit on sub-pixel boundaries (avoids shimmer).
            implicitHeight: Math.round(Math.max(row.active && editLoader.item
                                     ? editLoader.item.implicitHeight : row.renderedHeight, 24))

            property bool active: index === root.activeIndex
            property int level: root.headingLevel(src)
            property string body: level > 0 ? root.headingText(src) : src
            property bool blank: src.trim().length === 0
            property bool hr: !blank && root.isHr(src)

            // List item (bullet/number + indentation). Parsed once; content renders
            // as inline markdown so nesting & inline styling both work.
            property var listM: hr ? null : root.listInfo(src)
            property bool isList: !!listM
            property int indentPx: listM ? listM.cols * 8 : 0     // ~8px / leading column
            property int contentX: indentPx + 22                  // marker gutter
            property string listMarker: listM ? (listM.ordered ? listM.marker : "•") : ""
            property string listBody: listM ? listM.content : ""
            property bool listRich: isList && root.needsRich(listBody)

            property bool rich: !hr && !isList && root.needsRich(body)

            // Height comes from whichever representation is shown (so it's known
            // synchronously while scrolling — that's what keeps scrolling smooth).
            readonly property real renderedHeight: hr ? 24
                                                 : isList ? listLayout.implicitHeight
                                                 : view.implicitHeight

            // Horizontal rule (---/***/___) → a themed divider when not editing;
            // clicking it reveals the raw markers in the edit row like any line.
            Rectangle {
                visible: !row.active && row.hr
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.rightMargin: 6
                anchors.verticalCenter: parent.verticalCenter
                height: 2
                radius: 1
                color: Theme.divider
            }

            // Rendered (clean) view — headings & plain paragraphs. ALWAYS present so
            // the row height is known synchronously while scrolling. Hidden for the
            // active (editing), hr, and list rows (lists use listLayout below).
            Text {
                id: view
                width: row.width
                visible: !row.active && !row.blank && !row.hr && !row.isList
                // Plain prose → cheap PlainText; only lines with real markdown or
                // links pay for the rich renderer.
                textFormat: row.rich ? Text.MarkdownText : Text.PlainText
                text: row.isList ? "" : (row.rich ? root.mdLine(row.body) : row.body)
                wrapMode: Text.Wrap
                color: Theme.text                      // headings: normal colour, bigger/bold
                font.family: "Segoe UI"
                font.pixelSize: row.level > 0 ? root.headingSize(row.level) : 16
                font.bold: row.level > 0
            }

            // List item — bullet/number in the gutter + inline-markdown content with
            // a hanging indent (wrapped lines align under the content, not the dot).
            Item {
                id: listLayout
                visible: !row.active && row.isList
                width: row.width
                implicitHeight: Math.max(listContent.implicitHeight, 22)

                Text {
                    x: row.indentPx
                    width: 22
                    text: row.listMarker
                    color: Theme.textDim
                    font.family: "Segoe UI"
                    font.pixelSize: 16
                }
                Text {
                    id: listContent
                    x: row.contentX
                    width: Math.max(10, row.width - row.contentX)
                    textFormat: row.listRich ? Text.MarkdownText : Text.PlainText
                    text: row.listRich ? root.mdLine(row.listBody) : row.listBody
                    wrapMode: Text.Wrap
                    color: Theme.text
                    font.family: "Segoe UI"
                    font.pixelSize: 16
                }
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
                // A link can live in either the plain view OR the list content; test
                // whichever is showing (coords mapped into the list content's frame).
                function hrefAt(mx, my) {
                    if (view.visible) return view.linkAt(mx, my);
                    if (listLayout.visible) return listContent.linkAt(mx - listContent.x, my - listContent.y);
                    return "";
                }
                onPositionChanged: (m) => overLink = hrefAt(m.x, m.y).length > 0
                onClicked: (m) => {
                    var href = hrefAt(m.x, m.y);
                    if (href.length > 0) {
                        var pt = mapToItem(root, m.x, m.y);
                        root.handleLink(href, row.index, pt.x, pt.y);
                    } else {
                        root.activate(row.index, row.src.length);
                    }
                }
            }
        }

        // Small clickable strip below the last line → edit the last line. Kept
        // short so the text scrolls down close to the Ask-AI bar instead of leaving
        // a tall empty gap beneath the last line.
        footer: Item {
            width: listView.width
            height: 28
            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.IBeamCursor
                onClicked: if (lineModel.count > 0) root.activate(lineModel.count - 1)
            }
        }
    }

    // Smooth, higher-sensitivity mouse-wheel scrolling over the editor body.
    SmoothWheel { anchors.fill: listView; flick: listView; step: 165 }

    // Themed scrollbar overlay on the editor's right edge.
    ThemedScrollBar { flick: listView }

    // ── Multi-link action menu (anchored at the click) ──────────────────────
    Popup {
        id: linkMenu
        width: 224
        padding: 5
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

        property var targets: []
        property int linkLine: -1
        property int linkStart: -1
        property int linkEnd: -1

        function openFor(t, lineIndex, start, end, px, py) {
            linkMenu.targets = t;
            linkMenu.linkLine = lineIndex;
            linkMenu.linkStart = start;
            linkMenu.linkEnd = end;
            linkMenu.x = Math.max(0, Math.min(px, root.width - width - 8));
            linkMenu.y = Math.max(0, Math.min(py + 4, root.height - 8));
            linkMenu.open();
        }

        background: Rectangle {
            color: Theme.surface2
            border.color: Theme.border
            border.width: 1
            radius: 8
        }

        // A clickable row (used for "Open all" / "Create new").
        component ActionRow: Rectangle {
            property alias label: actionLabel.text
            signal triggered()
            width: linkMenu.width - 10
            height: 30
            radius: 5
            color: actionMouse.containsMouse ? Theme.accentSoft : "transparent"
            Behavior on color { ColorAnimation { duration: Theme.animFast } }
            Text {
                id: actionLabel
                anchors.left: parent.left; anchors.leftMargin: 8
                anchors.verticalCenter: parent.verticalCenter
                color: Theme.accent
                font.pixelSize: 13
                font.family: "Segoe UI"
            }
            MouseArea {
                id: actionMouse
                anchors.fill: parent
                hoverEnabled: true
                onClicked: parent.triggered()
            }
        }

        contentItem: Column {
            spacing: 2

            Text {
                text: "Open note"
                color: Theme.textFaint
                font.pixelSize: 11
                font.family: "Segoe UI"
                leftPadding: 8; topPadding: 4; bottomPadding: 2
            }

            Repeater {
                model: linkMenu.targets
                delegate: Rectangle {
                    required property string modelData
                    width: linkMenu.width - 10
                    height: 30
                    radius: 5
                    color: noteMouse.containsMouse ? Theme.elevated : "transparent"
                    Behavior on color { ColorAnimation { duration: Theme.animFast } }
                    Text {
                        anchors.left: parent.left; anchors.leftMargin: 8; anchors.right: parent.right; anchors.rightMargin: 8
                        anchors.verticalCenter: parent.verticalCenter
                        text: parent.modelData
                        color: noteMouse.containsMouse ? Theme.text : Theme.textDim
                        font.pixelSize: 13
                        font.family: "Segoe UI"
                        elide: Text.ElideRight
                    }
                    MouseArea {
                        id: noteMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: { root.linkClicked(parent.modelData); linkMenu.close(); }
                    }
                }
            }

            Rectangle { width: linkMenu.width - 10; height: 1; color: Theme.divider }

            ActionRow {
                label: "Open all in tabs"
                onTriggered: { root.openAllRequested(linkMenu.targets); linkMenu.close(); }
            }
            ActionRow {
                label: "Create new note"
                onTriggered: { root.createNoteForLink(linkMenu.linkLine, linkMenu.linkStart, linkMenu.linkEnd); linkMenu.close(); }
            }
        }
    }
}
