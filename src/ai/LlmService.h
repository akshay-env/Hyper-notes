#ifndef LLMSERVICE_H
#define LLMSERVICE_H

#include <QObject>
#include <QString>
#include <QStringList>
#include <QNetworkAccessManager>
#include <QtQml/qqmlregistration.h>

class QNetworkReply;

namespace HyperLinkNotes::AI {

// Minimal async client for chat-completion style LLM APIs. Provider-agnostic:
// the request/response shape is selected by `provider` ("anthropic" | "openai"),
// while the system prompt and token cap are applied uniformly above it. Built on
// QNetworkAccessManager, so calls are async on the main thread (no UI freeze).
class LlmService : public QObject
{
    Q_OBJECT
    QML_ELEMENT

    Q_PROPERTY(QString apiKey READ apiKey WRITE setApiKey NOTIFY apiKeyChanged)
    Q_PROPERTY(QString provider READ provider WRITE setProvider NOTIFY providerChanged)
    Q_PROPERTY(QString baseUrl READ baseUrl WRITE setBaseUrl NOTIFY baseUrlChanged)
    Q_PROPERTY(QString model READ model WRITE setModel NOTIFY modelChanged)
    Q_PROPERTY(QString systemPrompt READ systemPrompt WRITE setSystemPrompt NOTIFY systemPromptChanged)
    Q_PROPERTY(int maxTokens READ maxTokens WRITE setMaxTokens NOTIFY maxTokensChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)

public:
    explicit LlmService(QObject *parent = nullptr);

    QString apiKey() const { return m_apiKey; }
    void setApiKey(const QString &v);

    QString provider() const { return m_provider; }
    void setProvider(const QString &v);

    QString baseUrl() const { return m_baseUrl; }
    void setBaseUrl(const QString &v);

    QString model() const { return m_model; }
    void setModel(const QString &v);

    QString systemPrompt() const { return m_systemPrompt; }
    void setSystemPrompt(const QString &v);

    int maxTokens() const { return m_maxTokens; }
    void setMaxTokens(int v);

    bool busy() const { return m_busy; }

    // Sends `prompt` (optionally with `context` prepended) to the configured
    // provider. Emits responseReady(text) on success or failed(error) otherwise.
    // Only one request runs at a time; calls while busy are ignored.
    Q_INVOKABLE void ask(const QString &prompt, const QString &context = QString());
    Q_INVOKABLE void cancel();

    // Fetches the list of available models for the current provider/key.
    Q_INVOKABLE void fetchModels();

signals:
    void apiKeyChanged();
    void providerChanged();
    void baseUrlChanged();
    void modelChanged();
    void systemPromptChanged();
    void maxTokensChanged();
    void busyChanged();
    void responseReady(const QString &text);   // full text (also emitted at stream end)
    void streamChunk(const QString &delta);     // incremental text as it arrives
    void streamFinished();
    void failed(const QString &error);
    void modelsReady(const QStringList &models);
    void modelsFailed(const QString &error);

private:
    void setBusy(bool b);
    void onReadyRead();
    void drainBuffer();       // parse complete SSE lines out of m_sseBuffer
    void onReplyFinished();
    void onModelsFinished();

    QNetworkAccessManager m_net;
    QNetworkReply *m_reply = nullptr;
    QNetworkReply *m_modelsReply = nullptr;
    bool m_busy = false;

    // Streaming (SSE) accumulation.
    QByteArray m_sseBuffer;   // partial line carry-over between readyRead calls
    QByteArray m_raw;         // full raw body (for non-stream / error fallback)
    QString m_full;           // full text assembled from deltas
    bool m_anyChunk = false;

    QString m_apiKey;
    QString m_provider = QStringLiteral("anthropic");
    QString m_baseUrl;   // OpenAI-compatible endpoint base (empty → api.openai.com)
    QString m_model = QStringLiteral("claude-sonnet-4-6");
    QString m_systemPrompt = QStringLiteral(
        "You are a helpful writing assistant embedded in a note-taking app. "
        "Be concise and direct. Answer in at most a few short paragraphs, ideally "
        "under 150 words. Use plain Markdown. Do not add preamble or sign-offs.");
    int m_maxTokens = 600;
};

} // namespace HyperLinkNotes::AI

#endif // LLMSERVICE_H
