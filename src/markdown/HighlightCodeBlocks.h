#ifndef HIGHLIGHTCODEBLOCKS_H
#define HIGHLIGHTCODEBLOCKS_H

#include "HighlightLinks.h" // For FormatInstruction struct

namespace HyperLinkNotes::Core::Markdown {
    QList<FormatInstruction> calculateCodeBlockHighlights(const QString &text, int currentBlockPosition, int &previousBlockState);
}

#endif // HIGHLIGHTCODEBLOCKS_H
