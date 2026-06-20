#ifndef MARKDOWNHIGHLIGHTER_H
#define MARKDOWNHIGHLIGHTER_H

#include <QSyntaxHighlighter>
#include <QTextDocument>
#include <QRegularExpression>
#include <QQuickTextDocument>
#include <QtQml/qqmlregistration.h>

class MarkdownHighlighter : public QSyntaxHighlighter
{
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QQuickTextDocument* document READ quickDocument WRITE setQuickDocument NOTIFY quickDocumentChanged)
    Q_PROPERTY(int cursorPosition READ cursorPosition WRITE setCursorPosition NOTIFY cursorPositionChanged)

public:
    explicit MarkdownHighlighter(QObject *parent = nullptr);

    QQuickTextDocument* quickDocument() const;
    void setQuickDocument(QQuickTextDocument *doc);

    int cursorPosition() const;
    void setCursorPosition(int pos);

protected:
    void highlightBlock(const QString &text) override;

signals:
    void quickDocumentChanged();
    void cursorPositionChanged();

private:
    QQuickTextDocument *m_quickDocument = nullptr;
    int m_cursorPosition = -1;
    
    QRegularExpression m_linkPattern;
    QTextCharFormat m_linkTextFormat;
    QTextCharFormat m_hiddenBracketFormat;
    QTextCharFormat m_visibleBracketFormat;
};

#endif // MARKDOWNHIGHLIGHTER_H
