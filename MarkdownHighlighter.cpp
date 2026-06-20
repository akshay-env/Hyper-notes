#include "MarkdownHighlighter.h"
#include "src/markdown/HighlightLinks.h"
#include "src/markdown/HighlightHeaders.h"
#include "src/markdown/HighlightCodeBlocks.h"
#include <QTextDocument>
#include <QDebug>

using namespace HyperLinkNotes::Core::Markdown;

MarkdownHighlighter::MarkdownHighlighter(QObject *parent)
    : QSyntaxHighlighter(parent)
{
    // Patterns and Formats are initialized once
    m_linkPattern = QRegularExpression("\\[\\[(.*?)\\]\\]");

    m_linkTextFormat.setForeground(QColor("#FFD700")); 
    m_linkTextFormat.setFontWeight(QFont::Bold);

    m_hiddenBracketFormat.setForeground(Qt::transparent);
    m_hiddenBracketFormat.setFontPointSize(0.01);

    m_visibleBracketFormat.setForeground(QColor("#888888"));
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
        
    m_cursorPosition = pos;
    emit cursorPositionChanged();
    rehighlight();
}

void MarkdownHighlighter::highlightBlock(const QString &text)
{
    int currentBlockPos = currentBlock().position();
    int prevState = previousBlockState();
    
    // 1. Calculate Headers
    QList<FormatInstruction> headers = calculateHeaderHighlights(text, currentBlockPos);
    for (const auto& fmt : headers) {
        setFormat(fmt.start, fmt.length, fmt.format);
    }

    // 2. Calculate Code Blocks
    QList<FormatInstruction> codeBlocks = calculateCodeBlockHighlights(text, currentBlockPos, prevState);
    setCurrentBlockState(prevState);
    for (const auto& fmt : codeBlocks) {
        setFormat(fmt.start, fmt.length, fmt.format);
    }

    // 3. Calculate Links
    QList<FormatInstruction> links = calculateLinkHighlights(
        text, currentBlockPos, m_cursorPosition, 
        m_linkPattern, m_linkTextFormat, m_hiddenBracketFormat, m_visibleBracketFormat);
        
    for (const auto& fmt : links) {
        setFormat(fmt.start, fmt.length, fmt.format);
    }
}
