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
    signal branchRequested()                                            // selection → child note (parent frontmatter)

    property int activeIndex: -1      // source line that's currently raw/editable
    property int pendingCursor: 0     // caret position to drop when a row activates
    property bool _internal: false    // guard: our own writes shouldn't rebuild rows

    // ── Frontmatter (hidden from view) ──────────────────────────────────────
    // A leading `---` / `---` block (e.g. `parent: X`, written for the AI) is
    // machine context, not note content. The rows STAY in lineModel so the text
    // round-trips to disk untouched, but they render collapsed (height 0) and
    // can't be clicked, merged into, or reached with the arrow keys.
    property int fmEndLine: -1                                // index of the closing ---
    readonly property int firstVisibleLine: fmEndLine + 1     // first editable row

    // Mirrors frontmatter.js::parse — a `---` first line closed by the nearest
    // later `---` line. Unterminated → not frontmatter, show everything.
    function computeFmEnd(lines) {
        if (lines.length < 2 || !/^---[ \t]*$/.test(lines[0])) return -1;
        for (var i = 1; i < lines.length; i++)
            if (/^---[ \t]*$/.test(lines[i])) return i;
        return -1;
    }

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

    // ── Block selection (drag across LINES) ─────────────────────────────────
    // The per-line model makes only the active line a TextArea, so native mouse
    // selection can't cross line boundaries. This adds a whole-line block
    // selection: press+drag across rows highlights them; Delete/Backspace removes
    // them, Ctrl+C copies. (Char-precise selection still works within one line.)
    property int blockSelStart: -1
    property int blockSelEnd: -1
    readonly property bool hasBlockSel: blockSelStart >= 0 && blockSelEnd >= 0
    readonly property int blockLo: Math.min(blockSelStart, blockSelEnd)
    readonly property int blockHi: Math.max(blockSelStart, blockSelEnd)

    function clearBlockSel() { blockSelStart = -1; blockSelEnd = -1; }

    function deleteBlockSel() {
        if (!hasBlockSel) return;
        var lo = Math.max(blockLo, firstVisibleLine);
        var hi = Math.min(blockHi, lineModel.count - 1);
        for (var i = hi; i >= lo; i--) lineModel.remove(i);
        if (lineModel.count <= firstVisibleLine) lineModel.append({ "src": "" });
        clearBlockSel();
        scheduleSync();
        activate(Math.min(lo, lineModel.count - 1), 0);
    }

    function copyBlockSel() {
        if (!hasBlockSel) return;
        var s = [];
        var lo = Math.max(blockLo, firstVisibleLine);
        var hi = Math.min(blockHi, lineModel.count - 1);
        for (var i = lo; i <= hi; i++) s.push(lineModel.get(i).src);
        _clip.text = s.join("\n");
        _clip.selectAll();
        _clip.copy();
    }

    // ── Selection → note (branch / extract) ─────────────────────────────────
    // The editor's "current selection", from either mode: a whole-line BLOCK
    // selection (drag across rows) or a char selection inside the ACTIVE line's
    // TextArea. Returns "" when nothing is selected. This is what makes
    // branch/extract work on the per-line editor, which has no note-spanning
    // TextArea to read selectedText off of.
    function selectedText() {
        if (hasBlockSel) {
            var s = [];
            var lo = Math.max(blockLo, firstVisibleLine);
            var hi = Math.min(blockHi, lineModel.count - 1);
            for (var i = lo; i <= hi; i++) s.push(lineModel.get(i).src);
            return s.join("\n");
        }
        if (_activeField && _activeField.selectedText.length > 0)
            return _activeField.selectedText;
        return "";
    }
    readonly property bool hasSelection: hasBlockSel
        || (_activeField !== null && _activeField.selectedText.length > 0)

    // Replace the current selection (block OR char) with `replacement` (e.g. a
    // [[link]]), keeping lineModel + text in sync. A multi-line block collapses
    // to the single replacement line.
    function replaceSelection(replacement) {
        if (hasBlockSel) {
            var lo = Math.max(blockLo, firstVisibleLine);
            var hi = Math.min(blockHi, lineModel.count - 1);
            for (var i = hi; i > lo; i--) lineModel.remove(i);
            lineModel.setProperty(lo, "src", replacement);
            clearBlockSel();
            activeIndex = -1;
            syncNow();
        } else if (_activeField && _activeField.selectedText.length > 0) {
            var f = _activeField;
            var a = Math.min(f.selectionStart, f.selectionEnd);
            var b = Math.max(f.selectionStart, f.selectionEnd);
            f.remove(a, b);                          // fires the field's onTextChanged → model
            f.insert(a, replacement);
            f.cursorPosition = a + replacement.length;
            syncNow();
        }
    }

    // Open the selection context menu at (x, y) in root coords — only meaningful
    // when there's a selection to act on.
    function openContextMenu(x, y) {
        if (!hasSelection) return;
        selMenu.x = Math.max(0, Math.min(x, root.width - selMenu.width - 8));
        selMenu.y = Math.max(0, Math.min(y, root.height - 8));
        selMenu.open();
    }

    // Hidden helper for clipboard copy (Text has no copy(); TextEdit does).
    TextEdit { id: _clip; visible: false }

    // Keys for the block selection (root holds focus while a block is selected).
    Keys.onPressed: (e) => {
        if (!root.hasBlockSel) return;
        if (e.key === Qt.Key_Delete || e.key === Qt.Key_Backspace) { root.deleteBlockSel(); e.accepted = true; }
        else if (e.key === Qt.Key_Escape) { root.clearBlockSel(); e.accepted = true; }
        else if (e.key === Qt.Key_C && (e.modifiers & Qt.ControlModifier)) { root.copyBlockSel(); e.accepted = true; }
        else if (e.key === Qt.Key_X && (e.modifiers & Qt.ControlModifier)) { root.copyBlockSel(); root.deleteBlockSel(); e.accepted = true; }
    }

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
        fmEndLine = computeFmEnd(lines);
        // Guarantee at least one EDITABLE row below any hidden frontmatter.
        if (lineModel.count <= firstVisibleLine) lineModel.append({ "src": "" });
        activeIndex = -1;
        if (listView) {
            listView.model = lineModel;
            // Snap to the absolute top INCLUDING the header (the note title).
            // positionViewAtBeginning() lands on item 0 instead, scrolling the title
            // out of view right after open — set contentY to originY so the title
            // shows at the top (and stays reachable when scrolling back up).
            Qt.callLater(function () { if (listView) listView.contentY = listView.originY; });
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
        // Never enter the hidden frontmatter region; stay inside the model.
        i = Math.max(firstVisibleLine, Math.min(i, lineModel.count - 1));
        if (blockSelStart !== -1 && i !== blockLo) clearBlockSel();
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
        if (i <= firstVisibleLine) return;   // never merge into hidden frontmatter
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
        if (line < firstVisibleLine || line >= lineModel.count) return;
        listView.positionViewAtIndex(line, ListView.Beginning);
    }

    // ── In-note search ───────────────────────────────────────────────────────
    // Scan every source line for the (case-insensitive) query, collect all hits,
    // and jump to the first. Returns the match count.
    function runSearch(q) {
        var matches = [];
        var needle = (q || "").toLowerCase();
        if (needle.length > 0) {
            for (var i = firstVisibleLine; i < lineModel.count; i++) {
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

            // Right-click inside the edited line → our selection menu (branch /
            // extract), not the native Undo/Cut/Copy menu. Only when text is
            // selected; otherwise let the default caret placement happen.
            ContextMenu.menu: null
            ContextMenu.onRequested: (position) => {
                if (field.selectedText.length > 0) {
                    var pt = field.mapToItem(root, position.x, position.y);
                    root.openContextMenu(pt.x, pt.y);
                }
            }

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
                // "[" with a selection wraps it into a [[wikilink]] in place (the
                // quick keyboard way to make selected text a clickable link).
                if ((event.key === Qt.Key_BracketLeft || event.key === Qt.Key_BracketRight)
                        && selectionStart !== selectionEnd) {
                    var la = Math.min(selectionStart, selectionEnd);
                    var lb = Math.max(selectionStart, selectionEnd);
                    var sel = text.substring(la, lb);
                    remove(la, lb);
                    insert(la, "[[" + sel + "]]");
                    cursorPosition = la + sel.length + 4;
                    event.accepted = true;
                } else if (event.key === Qt.Key_Backspace && cursorPosition === 0
                        && selectionStart === selectionEnd && parent.rowIndex > root.firstVisibleLine) {
                    root.mergeUp(parent.rowIndex); event.accepted = true;
                } else if (event.key === Qt.Key_Up && noShift && atTop && parent.rowIndex > root.firstVisibleLine) {
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
            // Hidden frontmatter rows collapse to nothing; everything else is
            // rounded so rows never sit on sub-pixel boundaries (avoids shimmer).
            implicitHeight: row.fmHidden ? 0
                          : Math.round(Math.max(row.active && editLoader.item
                                     ? editLoader.item.implicitHeight : row.renderedHeight, 24))

            property bool fmHidden: index < root.firstVisibleLine
            visible: !fmHidden

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

            // Block-selection highlight (whole lines, drag-selected across rows).
            Rectangle {
                anchors.fill: parent
                z: -1
                visible: root.hasBlockSel && row.index >= root.blockLo && row.index <= root.blockHi
                color: Theme.accentSoft
            }

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

            // A link can live in either the plain view OR the list content; test
            // whichever is showing (coords in this row's frame). Used by the
            // selection overlay below the ListView for clicks and hover.
            function hrefAt(mx, my) {
                if (view.visible) return view.linkAt(mx, my);
                if (listLayout.visible) return listContent.linkAt(mx - listContent.x, my - listContent.y);
                return "";
            }
        }

        // Small strip below the last line so the text scrolls down close to the
        // Ask-AI bar instead of leaving a tall empty gap beneath the last line.
        // (Clicks here — and anywhere below the content — activate the last line
        // via the selection overlay.)
        footer: Item {
            width: listView.width
            height: 28
        }
    }

    // ── Selection overlay ───────────────────────────────────────────────────
    // ONE MouseArea over the whole list owns clicking, link opening, and drag
    // selection. The old per-row MouseAreas broke on bottom-up drags: their
    // index fallback snapped gap/header positions to the LAST line (flipping the
    // selection to the end of the note), a drag could not start on the active
    // row, and nothing scrolled when the pointer left the viewport. Centralizing
    // fixes all three: y→line mapping nudges across row gaps and clamps
    // header→first / footer→last, a press on the active row starts native-style
    // char selection that grows into a block selection when it crosses rows, and
    // an edge timer auto-scrolls mid-drag. Presses in the header band (the note
    // title) fall through untouched.
    MouseArea {
        id: selArea
        anchors.fill: listView
        hoverEnabled: true
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        preventStealing: true              // own the drag; never turns into a flick

        property int pressIndex: -1
        property bool dragging: false      // past the 4px threshold in THIS press
        property bool wasDrag: false       // survives release, gates the click handler
        property bool charMode: false      // press began on the active row's TextArea
        property point pressPt: Qt.point(0, 0)
        property real lastY: 0             // pointer y for auto-scroll ticks
        property bool overLink: false
        cursorShape: overLink ? Qt.PointingHandCursor : Qt.IBeamCursor

        // Viewport y → content y (overlay and viewport share a frame).
        function contentYAt(my) { return my + listView.contentY; }

        // Content y → line index, robust across the dead zones: nudge over the
        // 2px row spacing, clamp the header band to the first visible line and
        // the footer band / below-content space to the last line.
        function lineIndexAt(cy) {
            if (cy < 0) return root.firstVisibleLine;
            var idx = listView.indexAt(8, cy);
            if (idx < 0) idx = listView.indexAt(8, cy - listView.spacing - 1);
            if (idx < 0) idx = listView.indexAt(8, cy + listView.spacing + 1);
            if (idx < 0) return lineModel.count - 1;
            return Math.max(idx, root.firstVisibleLine);
        }

        // Rendered link under a viewport point ("" when none / row is raw).
        function hrefAtPoint(mx, my) {
            var cy = contentYAt(my);
            if (cy < 0) return "";
            var idx = listView.indexAt(8, cy);
            if (idx < 0 || idx === root.activeIndex) return "";
            var it = listView.itemAtIndex(idx);
            if (!it) return "";
            var p = mapToItem(it, mx, my);
            return it.hrefAt(p.x, p.y) || "";
        }

        onPressed: (m) => {
            if (contentYAt(m.y) < 0) { m.accepted = false; return; }   // header: title owns its input
            if (m.button === Qt.RightButton) {
                // Right-click over a block selection → the selection menu. (Char
                // selections are caught by the active field's ContextMenu above.)
                if (root.hasSelection) {
                    var rp = mapToItem(root, m.x, m.y);
                    root.openContextMenu(rp.x, rp.y);
                }
                return;
            }
            pressPt = Qt.point(m.x, m.y);
            lastY = m.y;
            dragging = false;
            wasDrag = false;
            charMode = false;
            pressIndex = lineIndexAt(contentYAt(m.y));
            if (pressIndex === root.activeIndex && root._activeField) {
                // Press on the line being edited → place the caret exactly like
                // the TextArea would; the drag stays observable so a cross-row
                // pull can grow into a block selection.
                var f = root._activeField;
                var fp = mapToItem(f, m.x, m.y);
                f.cursorPosition = f.positionAt(fp.x, fp.y);
                f.forceActiveFocus();
                charMode = true;
            }
        }

        onPositionChanged: (m) => {
            if (!(m.buttons & Qt.LeftButton)) {
                overLink = hrefAtPoint(m.x, m.y).length > 0;
                return;
            }
            lastY = m.y;
            if (!dragging && (Math.abs(m.x - pressPt.x) > 4 || Math.abs(m.y - pressPt.y) > 4)) {
                dragging = true;
                wasDrag = true;
                if (!charMode) {                        // whole-line drag from a rendered row
                    root.activeIndex = -1;
                    root.blockSelStart = pressIndex;
                    root.forceActiveFocus();
                }
            }
            if (!dragging) return;

            var idx = lineIndexAt(contentYAt(m.y));
            if (charMode) {
                if (idx === pressIndex && root._activeField) {
                    // Still inside the edited line → native char-precise selection.
                    var f = root._activeField;
                    var fp = mapToItem(f, m.x, m.y);
                    f.moveCursorSelection(f.positionAt(fp.x, fp.y), TextEdit.SelectCharacters);
                    return;
                }
                // Crossed the row boundary → grow into a whole-line block selection.
                charMode = false;
                root.activeIndex = -1;
                root.blockSelStart = pressIndex;
                root.forceActiveFocus();
            }
            root.blockSelEnd = idx;

            // Pointer at/beyond the viewport edges → keep scrolling the drag.
            scrollTick.dir = m.y < 24 ? -1 : (m.y > height - 24 ? 1 : 0);
            if (scrollTick.dir !== 0) { if (!scrollTick.running) scrollTick.start(); }
            else scrollTick.stop();
        }

        onReleased: { dragging = false; scrollTick.stop(); }
        onCanceled: { dragging = false; charMode = false; scrollTick.stop(); }
        onExited: overLink = false

        onClicked: (m) => {
            if (m.button !== Qt.LeftButton) return;   // right-click handled in onPressed
            // clicked fires AFTER released even when the mouse moved, so gate on
            // wasDrag (a drag is not a click) and charMode (caret already placed).
            if (wasDrag || charMode) return;
            root.clearBlockSel();
            var idx = pressIndex >= 0 ? pressIndex : lineIndexAt(contentYAt(m.y));
            var it = listView.itemAtIndex(idx);
            var href = "";
            if (it) { var p = mapToItem(it, m.x, m.y); href = it.hrefAt(p.x, p.y) || ""; }
            if (href.length > 0) {
                var pt = mapToItem(root, m.x, m.y);
                root.handleLink(href, idx, pt.x, pt.y);
            } else {
                root.activate(idx);
            }
        }

        onDoubleClicked: (m) => {
            // The first click activated the row (caret placed on this press), so
            // a double-click can word-select in the now-live TextArea.
            if (charMode && root._activeField) root._activeField.selectWord();
        }

        Timer {
            id: scrollTick
            interval: 16
            repeat: true
            property int dir: 0
            onTriggered: {
                // Same real range SmoothWheel clamps to (originY covers the header).
                var minY = listView.originY;
                var maxY = Math.max(minY, Math.floor(listView.originY + listView.contentHeight - listView.height));
                var next = Math.max(minY, Math.min(maxY, listView.contentY + dir * 14));
                if (next === listView.contentY) { stop(); return; }
                listView.contentY = next;
                // Keep the selection endpoint tracking the pointer as the view moves.
                root.blockSelEnd = selArea.lineIndexAt(selArea.contentYAt(selArea.lastY));
            }
        }
    }

    // Smooth, higher-sensitivity mouse-wheel scrolling over the editor body.
    SmoothWheel { anchors.fill: listView; flick: listView; step: 165 }

    // Themed scrollbar overlay on the editor's right edge.
    ThemedScrollBar { flick: listView }

    // ── Selection action menu (branch / extract) ────────────────────────────
    // Right-click on a selection (char selection in the active line, or a
    // whole-line block selection). The actual note creation lives in the host
    // (NoteEditor) via branchRequested / extractRequested, mirroring how
    // createNoteForLink is handled — this component stays selection-only.
    Popup {
        id: selMenu
        width: 210
        padding: 5
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

        background: Rectangle {
            color: Theme.surface2
            border.color: Theme.border
            border.width: 1
            radius: 8
        }

        component SelRow: Rectangle {
            property alias label: selRowLabel.text
            signal triggered()
            width: selMenu.width - 10
            height: 30
            radius: 5
            color: selRowMouse.containsMouse ? Theme.elevated : "transparent"
            Behavior on color { ColorAnimation { duration: Theme.animFast } }
            Text {
                id: selRowLabel
                anchors.left: parent.left; anchors.leftMargin: 10
                anchors.verticalCenter: parent.verticalCenter
                color: selRowMouse.containsMouse ? Theme.text : Theme.textDim
                font.pixelSize: 13
                font.family: "Segoe UI"
            }
            MouseArea {
                id: selRowMouse
                anchors.fill: parent
                hoverEnabled: true
                onClicked: parent.triggered()
            }
        }

        contentItem: Column {
            spacing: 2
            Text {
                text: "Selection"
                color: Theme.textFaint
                font.pixelSize: 11
                font.family: "Segoe UI"
                leftPadding: 10; topPadding: 4; bottomPadding: 2
            }
            SelRow {
                label: "Branch into new note"
                onTriggered: { selMenu.close(); root.branchRequested(); }
            }
        }
    }

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
