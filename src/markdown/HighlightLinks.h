#ifndef HIGHLIGHTLINKS_H
#define HIGHLIGHTLINKS_H

#include <QString>
#include <QRegularExpression>
#include <QTextCharFormat>

#include <QList>

namespace HyperLinkNotes::Core::Markdown {

struct FormatInstruction {
    int start;
    int length;
    QTextCharFormat format;
};

QList<FormatInstruction> calculateLinkHighlights(
    const QString &text, int currentBlockPosition, int cursorPosition,
    const QRegularExpression &linkPattern, 
    const QTextCharFormat &linkTextFormat, 
    const QTextCharFormat &hiddenBracketFormat, 
    const QTextCharFormat &visibleBracketFormat);

} // namespace HyperLinkNotes::Core::Markdown

#endif // HIGHLIGHTLINKS_H
