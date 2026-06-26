#include "HighlightLinks.h"

namespace HyperLinkNotes::Core::Markdown {

QList<FormatInstruction> calculateLinkHighlights(
    const QString &text, int currentBlockPosition, int cursorPosition,
    const QRegularExpression &linkPattern, 
    const QTextCharFormat &linkTextFormat, 
    const QTextCharFormat &hiddenBracketFormat, 
    const QTextCharFormat &visibleBracketFormat)
{
    QList<FormatInstruction> formats;

    // A multi-target link [[label|NoteA|NoteB]] shows only "label", with a
    // dashed underline as the "hover me for the list" affordance. Same gold as
    // a normal link otherwise.
    QTextCharFormat multiLinkLabelFormat = linkTextFormat;
    multiLinkLabelFormat.setFontUnderline(true);
    multiLinkLabelFormat.setUnderlineStyle(QTextCharFormat::DashUnderline);

    QRegularExpressionMatchIterator i = linkPattern.globalMatch(text);

    while (i.hasNext()) {
        QRegularExpressionMatch match = i.next();

        int matchStart = match.capturedStart(0);
        int matchLength = match.capturedLength(0);
        int innerStart = match.capturedStart(1);
        int innerLen = match.capturedLength(1);
        const QString inner = match.captured(1);
        int pipeIdx = inner.indexOf(QLatin1Char('|'));

        // Calculate the absolute position of this match within the entire document
        int absoluteMatchStart = currentBlockPosition + matchStart;
        int absoluteMatchEnd = absoluteMatchStart + matchLength;

        // Check if the cursor is anywhere touching or inside this specific link
        bool isCursorInside = (cursorPosition >= absoluteMatchStart && cursorPosition <= absoluteMatchEnd);

        if (isCursorInside) {
            // Editing: reveal the raw text (including any |targets) so it's editable.
            formats.append({matchStart, 2, visibleBracketFormat});            // [[
            formats.append({innerStart, innerLen, linkTextFormat});           // label|t1|t2
            formats.append({innerStart + innerLen, 2, visibleBracketFormat}); // ]]
        } else if (pipeIdx < 0) {
            // Single-target link — show the whole title.
            formats.append({matchStart, 2, hiddenBracketFormat});             // [[
            formats.append({innerStart, innerLen, linkTextFormat});           // title
            formats.append({innerStart + innerLen, 2, hiddenBracketFormat});  // ]]
        } else {
            // Multi-target link — show only the label (with any whitespace around
            // it hidden, so the underline hugs the text), hide "|t1|t2" and brackets.
            int labelStart = 0;        // offsets within `inner`
            int labelEnd = pipeIdx;    // exclusive
            while (labelStart < labelEnd && inner.at(labelStart).isSpace()) ++labelStart;
            while (labelEnd > labelStart && inner.at(labelEnd - 1).isSpace()) --labelEnd;

            formats.append({matchStart, 2, hiddenBracketFormat});                                  // [[
            if (labelStart > 0)
                formats.append({innerStart, labelStart, hiddenBracketFormat});                      // leading ws
            formats.append({innerStart + labelStart, labelEnd - labelStart, multiLinkLabelFormat}); // label
            formats.append({innerStart + labelEnd, innerLen - labelEnd, hiddenBracketFormat});      // trailing ws + |t1|t2
            formats.append({innerStart + innerLen, 2, hiddenBracketFormat});                        // ]]
        }
    }

    return formats;
}

} // namespace HyperLinkNotes::Core::Markdown
