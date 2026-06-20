#ifndef HIGHLIGHTHEADERS_H
#define HIGHLIGHTHEADERS_H

#include "HighlightLinks.h" // For FormatInstruction struct

namespace HyperLinkNotes::Core::Markdown {
    QList<FormatInstruction> calculateHeaderHighlights(const QString &text, int currentBlockPosition);
}

#endif // HIGHLIGHTHEADERS_H
