#include "MarkdownHighlighter.h"
#include "src/markdown/HighlightLinks.h"
#include "src/markdown/HighlightHeaders.h"
#include "src/markdown/HighlightCodeBlocks.h"
#include "src/markdown/HighlightEmphasis.h"
#include "src/markdown/HighlightLists.h"
#include <QTextDocument>
#include <QTextBlock>
#include <QDebug>

using namespace HyperLinkNotes::Core::Markdown;

MarkdownHighlighter::MarkdownHighlighter(QObject *parent)
    : QSyntaxHighlighter(parent)
{
    // Patterns and Formats are initialized once
    m_linkPattern = QRegularExpression("\\[\\[(.*?)\\]\\]");

    m_linkTextFormat.setForeground(QColor("#ffd23f")); // Theme.accent (Golden Slate)
    m_linkTextFormat.setFontWeight(QFont::Bold);

    m_hiddenBracketFormat.setForeground(Qt::transparent);
    m_hiddenBracketFormat.setFontPointSize(0.01);

    m_visibleBracketFormat.setForeground(QColor("#686e78")); // Theme.textMuted
}

QQuickTextDocument* MarkdownHighlighter::quickDocument() const
{
    return m_quickDocument;
}

void MarkdownHighlighter::setQuickDocument(QQuickTextDocument *doc)
{
    if (m_quickDocument == doc)
        return;
        
    m_quickDocument = doc;
    if (m_quickDocument) {
        setDocument(m_quickDocument->textDocument());
    } else {
        setDocument(nullptr);
    }
    emit quickDocumentChanged();
}

int MarkdownHighlighter::cursorPosition() const
{
    return m_cursorPosition;
}

void MarkdownHighlighter::setCursorPosition(int pos)
{
    if (m_cursorPosition == pos)
        return;

    const int old = m_cursorPosition;
    m_cursorPosition = pos;
    emit cursorPositionChanged();

    // Only the line the caret left and the line it entered change their reveal
    // state, so restyle just those two blocks — never the whole document. This
    // keeps caret movement O(1) instead of O(document size).
    QTextDocument *doc = document();
    if (!doc)
        return;

    const QTextBlock prevBlock = doc->findBlock(old);
    const QTextBlock currBlock = doc->findBlock(pos);
    if (prevBlock.isValid())
        rehighlightBlock(prevBlock);
    if (currBlock.isValid() && currBlock != prevBlock)
        rehighlightBlock(currBlock);
}

QColor MarkdownHighlighter::linkColor() const
{
    return m_linkTextFormat.foreground().color();
}

void MarkdownHighlighter::setLinkColor(const QColor &c)
{
    if (m_linkTextFormat.foreground().color() == c)
        return;
    m_linkTextFormat.setForeground(c);
    emit linkColorChanged();
    rehighlight();
}

void MarkdownHighlighter::highlightBlock(const QString &text)
{
    int currentBlockPos = currentBlock().position();
    int prevState = previousBlockState();

    // 1. Code blocks first — they decide whether this line is "code", and update
    //    the block state we carry to the next line.
    QList<FormatInstruction> codeBlocks = calculateCodeBlockHighlights(text, currentBlockPos, prevState);
    setCurrentBlockState(prevState);
    for (const auto& fmt : codeBlocks) {
        setFormat(fmt.start, fmt.length, fmt.format);
    }

    // Inside a fenced code block, leave the text raw — no headers/emphasis/links.
    if (!codeBlocks.isEmpty())
        return;

    // 2. Headers (a whole-line construct).
    QList<FormatInstruction> headers = calculateHeaderHighlights(text, currentBlockPos, m_cursorPosition);
    for (const auto& fmt : headers) {
        setFormat(fmt.start, fmt.length, fmt.format);
    }

    // 3. Line-prefix constructs (lists, tasks, blockquotes, rules) then inline
    //    emphasis (**bold**, *italic*, ~~strike~~, ==highlight==, `code`).
    //    Skipped on heading lines so emphasis can't clobber the heading size.
    if (headers.isEmpty()) {
        QList<FormatInstruction> lists = calculateListHighlights(text);
        for (const auto& fmt : lists) {
            setFormat(fmt.start, fmt.length, fmt.format);
        }

        QList<FormatInstruction> emphasis = calculateEmphasisHighlights(text, currentBlockPos, m_cursorPosition);
        for (const auto& fmt : emphasis) {
            setFormat(fmt.start, fmt.length, fmt.format);
        }
    }

    // 4. Links last, so link styling wins over any overlapping emphasis.
    QList<FormatInstruction> links = calculateLinkHighlights(
        text, currentBlockPos, m_cursorPosition,
        m_linkPattern, m_linkTextFormat, m_hiddenBracketFormat, m_visibleBracketFormat);

    for (const auto& fmt : links) {
        setFormat(fmt.start, fmt.length, fmt.format);
    }
}
