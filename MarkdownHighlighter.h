#ifndef MARKDOWNHIGHLIGHTER_H
#define MARKDOWNHIGHLIGHTER_H

#include <QSyntaxHighlighter>
#include <QTextDocument>
#include <QRegularExpression>
#include <QQuickTextDocument>
#include <QColor>
#include <QtQml/qqmlregistration.h>

class MarkdownHighlighter : public QSyntaxHighlighter
{
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QQuickTextDocument* document READ quickDocument WRITE setQuickDocument NOTIFY quickDocumentChanged)
    Q_PROPERTY(int cursorPosition READ cursorPosition WRITE setCursorPosition NOTIFY cursorPositionChanged)
    Q_PROPERTY(QColor linkColor READ linkColor WRITE setLinkColor NOTIFY linkColorChanged)

public:
    explicit MarkdownHighlighter(QObject *parent = nullptr);

    QQuickTextDocument* quickDocument() const;
    void setQuickDocument(QQuickTextDocument *doc);

    int cursorPosition() const;
    void setCursorPosition(int pos);

    QColor linkColor() const;
    void setLinkColor(const QColor &c);

protected:
    void highlightBlock(const QString &text) override;

signals:
    void quickDocumentChanged();
    void cursorPositionChanged();
    void linkColorChanged();

private:
    QQuickTextDocument *m_quickDocument = nullptr;
    int m_cursorPosition = -1;
    
    QRegularExpression m_linkPattern;
    QTextCharFormat m_linkTextFormat;
    QTextCharFormat m_hiddenBracketFormat;
    QTextCharFormat m_visibleBracketFormat;
};

#endif // MARKDOWNHIGHLIGHTER_H
