#include "HighlightEmphasis.h"

#include <QColor>
#include <QFont>

namespace HyperLinkNotes::Core::Markdown {

namespace {

// Emit format instructions for every match of `re` in `text`: the body gets
// `bodyFmt`, and the `markerLen`-char markers on each side are dimmed when the
// caret is inside the span and collapsed (hidden) when it is not.
void emitSpans(QList<FormatInstruction> &out,
               const QString &text, int currentBlockPosition, int cursorPosition,
               const QRegularExpression &re, int markerLen,
               const QTextCharFormat &bodyFmt)
{
    QTextCharFormat hiddenMarker;
    hiddenMarker.setForeground(Qt::transparent);
    hiddenMarker.setFontPointSize(0.01);          // collapse the marker glyphs

    QTextCharFormat shownMarker;
    shownMarker.setForeground(QColor("#686e78"));  // Theme.textMuted

    QRegularExpressionMatchIterator it = re.globalMatch(text);
    while (it.hasNext()) {
        const QRegularExpressionMatch m = it.next();
        const int s          = m.capturedStart(0);
        const int len        = m.capturedLength(0);
        const int innerStart = m.capturedStart(1);
        const int innerLen   = m.capturedLength(1);

        const int absStart = currentBlockPosition + s;
        const int absEnd   = absStart + len;
        const bool caretInside =
            cursorPosition >= absStart && cursorPosition <= absEnd;
        const QTextCharFormat &markerFmt = caretInside ? shownMarker : hiddenMarker;

        out.append({ s, markerLen, markerFmt });                      // opening marker
        out.append({ innerStart, innerLen, bodyFmt });                // content
        out.append({ innerStart + innerLen, markerLen, markerFmt });  // closing marker
    }
}

} // namespace

QList<FormatInstruction> calculateEmphasisHighlights(
    const QString &text, int currentBlockPosition, int cursorPosition)
{
    QList<FormatInstruction> formats;

    // `inline code` first. Bold (**/__) before italic (*/_) so the double markers
    // win; the lookarounds keep single-marker italic from biting into bold, and
    // the \w guards on the underscore forms stop snake_case from going italic.
    static const QRegularExpression inlineCode(QStringLiteral("`([^`]+?)`"));
    static const QRegularExpression strike(QStringLiteral("~~([^~]+?)~~"));
    static const QRegularExpression highlight(QStringLiteral("==([^=]+?)=="));
    static const QRegularExpression boldStar(QStringLiteral("\\*\\*([^*]+?)\\*\\*"));
    static const QRegularExpression boldUnder(QStringLiteral("(?<!\\w)__([^_]+?)__(?!\\w)"));
    static const QRegularExpression italicStar(
        QStringLiteral("(?<!\\*)\\*(?!\\*)([^*]+?)(?<!\\*)\\*(?!\\*)"));
    static const QRegularExpression italicUnder(
        QStringLiteral("(?<!\\w)_(?!_)([^_]+?)_(?!\\w)"));

    QTextCharFormat codeFmt;
    codeFmt.setFontFamilies({ QStringLiteral("Consolas") });
    codeFmt.setForeground(QColor("#e06c75"));
    codeFmt.setBackground(QColor("#2a2e37"));

    QTextCharFormat strikeFmt;
    strikeFmt.setFontStrikeOut(true);
    strikeFmt.setForeground(QColor("#9aa0aa"));

    QTextCharFormat highlightFmt;                 // Obsidian ==highlight==
    highlightFmt.setBackground(QColor("#4a431c"));
    highlightFmt.setForeground(QColor("#f4e7a1"));

    QTextCharFormat boldFmt;
    boldFmt.setFontWeight(QFont::Bold);

    QTextCharFormat italicFmt;
    italicFmt.setFontItalic(true);

    emitSpans(formats, text, currentBlockPosition, cursorPosition, inlineCode, 1, codeFmt);
    emitSpans(formats, text, currentBlockPosition, cursorPosition, strike,     2, strikeFmt);
    emitSpans(formats, text, currentBlockPosition, cursorPosition, highlight,  2, highlightFmt);
    emitSpans(formats, text, currentBlockPosition, cursorPosition, boldStar,   2, boldFmt);
    emitSpans(formats, text, currentBlockPosition, cursorPosition, boldUnder,  2, boldFmt);
    emitSpans(formats, text, currentBlockPosition, cursorPosition, italicStar, 1, italicFmt);
    emitSpans(formats, text, currentBlockPosition, cursorPosition, italicUnder,1, italicFmt);

    // Escaped punctuation: hide the backslash so "M87\*" renders as "M87*" (the
    // char stays literal; an unpaired escaped marker no longer reads as markdown).
    static const QRegularExpression escapeRe(
        QStringLiteral("\\\\([\\\\`*_{}\\[\\]()#+\\-.!~=>|])"));
    QTextCharFormat hiddenSlash;
    hiddenSlash.setForeground(Qt::transparent);
    hiddenSlash.setFontPointSize(0.01);
    QRegularExpressionMatchIterator esc = escapeRe.globalMatch(text);
    while (esc.hasNext()) {
        const QRegularExpressionMatch m = esc.next();
        formats.append({ static_cast<int>(m.capturedStart(0)), 1, hiddenSlash });
    }

    return formats;
}

} // namespace HyperLinkNotes::Core::Markdown
