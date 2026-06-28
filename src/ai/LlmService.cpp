#include "LlmService.h"

#include <QNetworkReply>
#include <QNetworkRequest>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QUrl>

namespace HyperLinkNotes::AI {

LlmService::LlmService(QObject *parent) : QObject(parent) {}

void LlmService::setApiKey(const QString &v)        { if (m_apiKey == v) return; m_apiKey = v; emit apiKeyChanged(); }
void LlmService::setProvider(const QString &v)      { if (m_provider == v) return; m_provider = v; emit providerChanged(); }
void LlmService::setBaseUrl(const QString &v)       { if (m_baseUrl == v) return; m_baseUrl = v; emit baseUrlChanged(); }
void LlmService::setModel(const QString &v)         { if (m_model == v) return; m_model = v; emit modelChanged(); }
void LlmService::setSystemPrompt(const QString &v)  { if (m_systemPrompt == v) return; m_systemPrompt = v; emit systemPromptChanged(); }
void LlmService::setMaxTokens(int v)                { if (m_maxTokens == v) return; m_maxTokens = v; emit maxTokensChanged(); }

void LlmService::setBusy(bool b) { if (m_busy == b) return; m_busy = b; emit busyChanged(); }

void LlmService::cancel()
{
    if (m_reply) m_reply->abort();   // triggers finished() with an OperationCanceledError
}

void LlmService::fetchModels()
{
    if (m_apiKey.trimmed().isEmpty()) {
        emit modelsFailed(QStringLiteral("Enter an API key first."));
        return;
    }
    if (m_modelsReply) { m_modelsReply->abort(); m_modelsReply = nullptr; }

    const QString provider = m_provider.toLower();
    QNetworkRequest req;

    if (provider == QStringLiteral("anthropic")) {
        req.setUrl(QUrl(QStringLiteral("https://api.anthropic.com/v1/models")));
        req.setRawHeader("x-api-key", m_apiKey.toUtf8());
        req.setRawHeader("anthropic-version", "2023-06-01");
    } else {
        QString base;
        if (provider == QStringLiteral("gemini")) {
            base = QStringLiteral("https://generativelanguage.googleapis.com/v1beta/openai");
        } else {
            base = m_baseUrl.trimmed();
            if (base.isEmpty()) base = QStringLiteral("https://api.openai.com/v1");
        }
        while (base.endsWith('/')) base.chop(1);
        req.setUrl(QUrl(base + QStringLiteral("/models")));
        req.setRawHeader("Authorization", (QStringLiteral("Bearer ") + m_apiKey).toUtf8());
    }

    m_modelsReply = m_net.get(req);
    connect(m_modelsReply, &QNetworkReply::finished, this, &LlmService::onModelsFinished);
}

void LlmService::onModelsFinished()
{
    QNetworkReply *reply = m_modelsReply;
    m_modelsReply = nullptr;
    if (!reply) return;
    reply->deleteLater();

    const QByteArray data = reply->readAll();

    if (reply->error() != QNetworkReply::NoError) {
        QString msg = reply->errorString();
        QJsonParseError pe;
        const QJsonDocument doc = QJsonDocument::fromJson(data, &pe);
        if (pe.error == QJsonParseError::NoError && doc.isObject()) {
            const QString apiMsg = doc.object().value("error").toObject().value("message").toString();
            if (!apiMsg.isEmpty()) msg = apiMsg;
        }
        emit modelsFailed(msg);
        return;
    }

    QJsonParseError pe;
    const QJsonDocument doc = QJsonDocument::fromJson(data, &pe);
    if (pe.error != QJsonParseError::NoError || !doc.isObject()) {
        emit modelsFailed(QStringLiteral("Could not parse the model list."));
        return;
    }

    // Both Anthropic and OpenAI-compatible endpoints return { "data": [ { "id" } ] }.
    QStringList models;
    const QJsonArray arr = doc.object().value("data").toArray();
    for (int i = 0; i < arr.size(); ++i) {
        QString id = arr.at(i).toObject().value("id").toString();
        if (id.startsWith(QStringLiteral("models/"))) id = id.mid(7);   // strip Gemini prefix
        if (!id.isEmpty()) models.append(id);
    }
    models.removeDuplicates();
    models.sort(Qt::CaseInsensitive);

    if (models.isEmpty()) { emit modelsFailed(QStringLiteral("No models returned.")); return; }
    emit modelsReady(models);
}

void LlmService::ask(const QString &prompt, const QString &context)
{
    if (m_busy) return;
    if (m_apiKey.trimmed().isEmpty()) {
        emit failed(QStringLiteral("No API key set. Add one in Settings."));
        return;
    }
    if (prompt.trimmed().isEmpty()) return;

    const QString userContent = context.trimmed().isEmpty()
        ? prompt
        : (QStringLiteral("Context:\n") + context + QStringLiteral("\n\n---\n\n") + prompt);

    QNetworkRequest req;
    QJsonObject body;
    const QString provider = m_provider.toLower();

    if (provider == QStringLiteral("anthropic")) {
        // Anthropic Messages API
        req.setUrl(QUrl(QStringLiteral("https://api.anthropic.com/v1/messages")));
        req.setRawHeader("x-api-key", m_apiKey.toUtf8());
        req.setRawHeader("anthropic-version", "2023-06-01");
        req.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));

        QJsonArray messages;
        messages.append(QJsonObject{{"role", "user"}, {"content", userContent}});
        body.insert("model", m_model);
        body.insert("system", m_systemPrompt);
        body.insert("messages", messages);
        body.insert("max_tokens", m_maxTokens);
    } else {
        // OpenAI-compatible (OpenAI, Google Gemini, OpenRouter, Groq, Ollama, …).
        // Gemini exposes an OpenAI-compatible endpoint, so it reuses this path.
        QString base;
        if (provider == QStringLiteral("gemini")) {
            base = QStringLiteral("https://generativelanguage.googleapis.com/v1beta/openai");
        } else {
            base = m_baseUrl.trimmed();
            if (base.isEmpty()) base = QStringLiteral("https://api.openai.com/v1");
        }
        while (base.endsWith('/')) base.chop(1);

        req.setUrl(QUrl(base + QStringLiteral("/chat/completions")));
        req.setRawHeader("Authorization", (QStringLiteral("Bearer ") + m_apiKey).toUtf8());
        req.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));

        QJsonArray messages;
        messages.append(QJsonObject{{"role", "system"}, {"content", m_systemPrompt}});
        messages.append(QJsonObject{{"role", "user"}, {"content", userContent}});
        body.insert("model", m_model);
        body.insert("messages", messages);
        body.insert("max_tokens", m_maxTokens);
    }

    body.insert("stream", true);   // request SSE streaming from both providers

    m_sseBuffer.clear();
    m_raw.clear();
    m_full.clear();
    m_anyChunk = false;

    setBusy(true);
    m_reply = m_net.post(req, QJsonDocument(body).toJson(QJsonDocument::Compact));
    connect(m_reply, &QNetworkReply::readyRead, this, &LlmService::onReadyRead);
    connect(m_reply, &QNetworkReply::finished, this, &LlmService::onReplyFinished);
}

void LlmService::onReadyRead()
{
    if (!m_reply) return;
    const QByteArray chunk = m_reply->readAll();
    m_raw += chunk;
    m_sseBuffer += chunk;
    drainBuffer();
}

// Pulls text deltas out of complete SSE lines, emitting streamChunk for each.
void LlmService::drainBuffer()
{
    const bool openai = (m_provider.toLower() != QStringLiteral("anthropic"));

    int nl;
    while ((nl = m_sseBuffer.indexOf('\n')) >= 0) {
        QByteArray line = m_sseBuffer.left(nl);
        m_sseBuffer.remove(0, nl + 1);
        if (line.endsWith('\r')) line.chop(1);
        if (!line.startsWith("data:")) continue;

        const QByteArray payload = line.mid(5).trimmed();
        if (payload.isEmpty() || payload == "[DONE]") continue;

        QJsonParseError pe;
        const QJsonDocument doc = QJsonDocument::fromJson(payload, &pe);
        if (pe.error != QJsonParseError::NoError || !doc.isObject()) continue;
        const QJsonObject obj = doc.object();

        QString delta;
        if (openai) {
            const QJsonArray ch = obj.value("choices").toArray();
            if (!ch.isEmpty())
                delta = ch.first().toObject().value("delta").toObject().value("content").toString();
        } else if (obj.value("type").toString() == QStringLiteral("content_block_delta")) {
            const QJsonObject d = obj.value("delta").toObject();
            if (d.value("type").toString() == QStringLiteral("text_delta"))
                delta = d.value("text").toString();
        }

        if (!delta.isEmpty()) {
            m_anyChunk = true;
            m_full += delta;
            emit streamChunk(delta);
        }
    }
}

void LlmService::onReplyFinished()
{
    QNetworkReply *reply = m_reply;
    m_reply = nullptr;
    setBusy(false);
    if (!reply) return;
    reply->deleteLater();

    const QString netErr = reply->errorString();
    const bool httpError = (reply->error() != QNetworkReply::NoError);

    // Drain anything not yet delivered via readyRead().
    const QByteArray tail = reply->readAll();
    m_raw += tail;
    m_sseBuffer += tail;
    drainBuffer();

    if (m_anyChunk) {
        // Streamed content arrived — success (even if the socket then errored).
        emit responseReady(m_full.trimmed());
        emit streamFinished();
        return;
    }

    // No deltas: the server either ignored stream:true (one JSON completion) or
    // returned a JSON error. Parse the raw body either way.
    QString text, errMsg;
    QJsonParseError pe;
    const QJsonDocument doc = QJsonDocument::fromJson(m_raw, &pe);
    if (pe.error == QJsonParseError::NoError && doc.isObject()) {
        const QJsonObject obj = doc.object();
        if (obj.contains("error")) {
            errMsg = obj.value("error").toObject().value("message").toString();
        } else if (m_provider.toLower() != QStringLiteral("anthropic")) {
            const QJsonArray ch = obj.value("choices").toArray();
            if (!ch.isEmpty())
                text = ch.first().toObject().value("message").toObject().value("content").toString();
        } else {
            const QJsonArray content = obj.value("content").toArray();
            for (int i = 0; i < content.size(); ++i) {
                const QJsonObject part = content.at(i).toObject();
                if (part.value("type").toString() == QStringLiteral("text"))
                    text += part.value("text").toString();
            }
        }
    }

    if (!text.trimmed().isEmpty()) {
        emit streamChunk(text.trimmed());   // deliver as one chunk so the editor inserts it
        emit responseReady(text.trimmed());
        emit streamFinished();
        return;
    }

    if (errMsg.isEmpty())
        errMsg = httpError ? netErr : QStringLiteral("The model returned an empty response.");
    emit failed(errMsg);
}

} // namespace HyperLinkNotes::AI
