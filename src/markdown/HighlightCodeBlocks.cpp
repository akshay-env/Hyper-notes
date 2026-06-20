#include "HighlightCodeBlocks.h"

namespace HyperLinkNotes::Core::Markdown {

QList<FormatInstruction> calculateCodeBlockHighlights(const QString &text, int currentBlockPosition, int &previousBlockState)
{
    QList<FormatInstruction> formats;
    // TODO: Implement multi-line Code Block Regex Logic Here (```)
    return formats;
}

} // namespace HyperLinkNotes::Core::Markdown
