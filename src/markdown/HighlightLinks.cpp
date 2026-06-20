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
    QRegularExpressionMatchIterator i = linkPattern.globalMatch(text);
    
    while (i.hasNext()) {
        QRegularExpressionMatch match = i.next();
        
        int matchStart = match.capturedStart(0);
        int matchLength = match.capturedLength(0);
        
        // Calculate the absolute position of this match within the entire document
        int absoluteMatchStart = currentBlockPosition + matchStart;
        int absoluteMatchEnd = absoluteMatchStart + matchLength;
        
        // Check if the cursor is anywhere touching or inside this specific link
        bool isCursorInside = (cursorPosition >= absoluteMatchStart && cursorPosition <= absoluteMatchEnd);
        
        if (isCursorInside) {
            formats.append({matchStart, 2, visibleBracketFormat}); // [[
            formats.append({match.capturedStart(1), match.capturedLength(1), linkTextFormat}); // Link text
            formats.append({match.capturedEnd(1), 2, visibleBracketFormat}); // ]]
        } else {
            formats.append({matchStart, 2, hiddenBracketFormat}); // [[
            formats.append({match.capturedStart(1), match.capturedLength(1), linkTextFormat}); // Link text
            formats.append({match.capturedEnd(1), 2, hiddenBracketFormat}); // ]]
        }
    }
    
    return formats;
}

} // namespace HyperLinkNotes::Core::Markdown
