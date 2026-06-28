#ifndef HIGHLIGHTLISTS_H
#define HIGHLIGHTLISTS_H

#include "HighlightLinks.h" // For FormatInstruction struct

namespace HyperLinkNotes::Core::Markdown {
    // Line-prefix constructs: blockquotes (>), horizontal rules (--- / *** / ___),
    // task checkboxes (- [ ] / - [x]), unordered list markers (- * +) and ordered
    // list markers (1. / 1)). These are whole-line shapes, so no cursor reveal.
    QList<FormatInstruction> calculateListHighlights(const QString &text);
}

#endif // HIGHLIGHTLISTS_H
