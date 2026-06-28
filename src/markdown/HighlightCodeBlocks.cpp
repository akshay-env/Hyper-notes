#include "HighlightCodeBlocks.h"

#include <QColor>
#include <QRegularExpression>

namespace HyperLinkNotes::Core::Markdown {

// Multi-line fenced code blocks (``` ... ```). QSyntaxHighlighter feeds us one
// line at a time, so we carry "am I inside a fence?" across lines via the block
// state (0 = normal, 1 = inside a code fence). `previousBlockState` comes in as
// the prior line's state and is updated in place to this line's state; the
// caller passes it to setCurrentBlockState().
QList<FormatInstruction> calculateCodeBlockHighlights(
    const QString &text, int /*currentBlockPosition*/, int &previousBlockState)
{
    QList<FormatInstruction> formats;

    const bool wasInside = (previousBlockState == 1);

    // A fence line is one whose first non-space content is ``` (optionally
    // followed by a language tag, e.g. ```cpp).
    static const QRegularExpression fence(QStringLiteral("^\\s*```"));
    const bool isFence = fence.match(text).hasMatch();

    QTextCharFormat codeFmt;
    codeFmt.setFontFamilies({ QStringLiteral("Consolas") });
    codeFmt.setForeground(QColor("#abb2bf"));
    codeFmt.setBackground(QColor("#23272e"));

    const int textLen = static_cast<int>(text.length());

    if (wasInside) {
        // Still inside the block — the whole line is code, including a closing fence.
        formats.append({ 0, textLen, codeFmt });
        previousBlockState = isFence ? 0 : 1;  // a fence here closes the block
    } else if (isFence) {
        // Opening fence — start a block and style the fence line itself.
        formats.append({ 0, textLen, codeFmt });
        previousBlockState = 1;
    } else {
        previousBlockState = 0;                 // ordinary line
    }

    return formats;
}

} // namespace HyperLinkNotes::Core::Markdown
