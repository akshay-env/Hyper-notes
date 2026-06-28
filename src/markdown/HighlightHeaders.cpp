#include "HighlightHeaders.h"

#include <QColor>
#include <QFont>

namespace HyperLinkNotes::Core::Markdown {

QList<FormatInstruction> calculateHeaderHighlights(
    const QString &text, int currentBlockPosition, int cursorPosition)
{
    QList<FormatInstruction> formats;

    // ^ 1–6 '#', then required whitespace, then the heading text. The space is
    // mandatory in Markdown — "#title" is plain text, "# title" is a heading.
    static const QRegularExpression headerPattern(
        QStringLiteral("^(#{1,6})[ \\t]+(.*)$"));

    const QRegularExpressionMatch m = headerPattern.match(text);
    if (!m.hasMatch())
        return formats;

    const int level     = m.capturedLength(1);   // 1..6
    const int textStart = m.capturedStart(2);     // first char after "# "

    // Size shrinks as the level grows: H1 biggest, H6 smallest.
    static const qreal sizes[6] = { 28, 24, 21, 18, 16, 15 };

    QTextCharFormat headingFmt;
    headingFmt.setFontPointSize(sizes[level - 1]);
    headingFmt.setFontWeight(QFont::Bold);
    headingFmt.setForeground(QColor("#e8eaed")); // ~Theme.text

    // The "### " marker: dimmed while the caret is on this line (so it stays
    // editable), collapsed away otherwise. This is the live-preview reveal.
    const int textLen  = static_cast<int>(text.length());
    const int blockEnd = currentBlockPosition + textLen;
    const bool cursorOnLine =
        cursorPosition >= currentBlockPosition && cursorPosition <= blockEnd;

    QTextCharFormat markerFmt = headingFmt;
    if (cursorOnLine) {
        markerFmt.setForeground(QColor("#686e78")); // Theme.textMuted
    } else {
        markerFmt.setForeground(Qt::transparent);
        markerFmt.setFontPointSize(0.01);           // collapse "### "
    }

    formats.append({ 0, textStart, markerFmt });                     // "### "
    formats.append({ textStart, textLen - textStart, headingFmt });  // the words
    return formats;
}

} // namespace HyperLinkNotes::Core::Markdown
