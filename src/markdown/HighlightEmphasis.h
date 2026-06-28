#ifndef HIGHLIGHTEMPHASIS_H
#define HIGHLIGHTEMPHASIS_H

#include "HighlightLinks.h" // For FormatInstruction struct

namespace HyperLinkNotes::Core::Markdown {
    // Inline emphasis: **bold**, *italic*, and `inline code`. Markers are hidden
    // when the caret is elsewhere and revealed (dimmed) when it sits inside the
    // span, mirroring the [[link]] live-preview behaviour.
    QList<FormatInstruction> calculateEmphasisHighlights(
        const QString &text, int currentBlockPosition, int cursorPosition);
}

#endif // HIGHLIGHTEMPHASIS_H
