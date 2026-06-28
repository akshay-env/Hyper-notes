#include "HighlightLists.h"

#include <QColor>
#include <QFont>
#include <QRegularExpression>

namespace HyperLinkNotes::Core::Markdown {

QList<FormatInstruction> calculateListHighlights(const QString &text)
{
    QList<FormatInstruction> formats;

    // Checked first → most specific to least: a "- [x]" line also looks like a
    // bullet, and a "* * *" rule also looks like a bullet, so order matters.
    static const QRegularExpression quoteRe(QStringLiteral("^(\\s*>+\\s?)(.*)$"));
    static const QRegularExpression hrRe(QStringLiteral("^\\s*([-*_])(?:[ \\t]*\\1){2,}[ \\t]*$"));
    static const QRegularExpression taskRe(QStringLiteral("^(\\s*[-*+]\\s+)(\\[[ xX]\\])(\\s+)(.*)$"));
    static const QRegularExpression bulletRe(QStringLiteral("^(\\s*)([-*+])(\\s+)"));
    static const QRegularExpression orderedRe(QStringLiteral("^(\\s*)(\\d{1,9}[.)])(\\s+)"));

    const QColor accent("#ffd23f");
    const QColor muted("#9aa0aa");
    const QColor faint("#686e78");
    const QColor done("#7ec77e");

    // Blockquote — dim the > markers, render the quoted text muted italic.
    const QRegularExpressionMatch qm = quoteRe.match(text);
    if (qm.hasMatch()) {
        QTextCharFormat markerFmt; markerFmt.setForeground(faint);
        QTextCharFormat bodyFmt;   bodyFmt.setForeground(muted); bodyFmt.setFontItalic(true);
        formats.append({ static_cast<int>(qm.capturedStart(1)), static_cast<int>(qm.capturedLength(1)), markerFmt });
        formats.append({ static_cast<int>(qm.capturedStart(2)), static_cast<int>(qm.capturedLength(2)), bodyFmt });
        return formats;
    }

    // Horizontal rule — a whole line of repeated -, * or _ (dimmed).
    if (hrRe.match(text).hasMatch()) {
        QTextCharFormat hrFmt; hrFmt.setForeground(faint);
        formats.append({ 0, static_cast<int>(text.length()), hrFmt });
        return formats;
    }

    // Task checkbox — accent the marker + box; strike through completed items.
    const QRegularExpressionMatch tm = taskRe.match(text);
    if (tm.hasMatch()) {
        const bool checked = tm.captured(2).contains(QLatin1Char('x'), Qt::CaseInsensitive);
        QTextCharFormat bulletFmt; bulletFmt.setForeground(accent); bulletFmt.setFontWeight(QFont::Bold);
        QTextCharFormat boxFmt;    boxFmt.setForeground(checked ? done : accent); boxFmt.setFontWeight(QFont::Bold);
        formats.append({ static_cast<int>(tm.capturedStart(1)), static_cast<int>(tm.capturedLength(1)), bulletFmt }); // "- "
        formats.append({ static_cast<int>(tm.capturedStart(2)), static_cast<int>(tm.capturedLength(2)), boxFmt });    // "[ ]" / "[x]"
        if (checked) {
            QTextCharFormat doneFmt; doneFmt.setForeground(faint); doneFmt.setFontStrikeOut(true);
            formats.append({ static_cast<int>(tm.capturedStart(4)), static_cast<int>(tm.capturedLength(4)), doneFmt });
        }
        return formats;
    }

    // Unordered list — accent the bullet glyph.
    const QRegularExpressionMatch bm = bulletRe.match(text);
    if (bm.hasMatch()) {
        QTextCharFormat bulletFmt; bulletFmt.setForeground(accent); bulletFmt.setFontWeight(QFont::Bold);
        formats.append({ static_cast<int>(bm.capturedStart(2)), static_cast<int>(bm.capturedLength(2)), bulletFmt });
        return formats;
    }

    // Ordered list — accent the "1." / "1)" marker.
    const QRegularExpressionMatch om = orderedRe.match(text);
    if (om.hasMatch()) {
        QTextCharFormat numFmt; numFmt.setForeground(accent);
        formats.append({ static_cast<int>(om.capturedStart(2)), static_cast<int>(om.capturedLength(2)), numFmt });
        return formats;
    }

    return formats;
}

} // namespace HyperLinkNotes::Core::Markdown
