#include "BinIndex.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>

namespace HyperLinkNotes::Core::Vault {

QString binDir(const QString &vaultPath)
{
    return vaultPath + "/.bin";
}

QString binIndexFile(const QString &vaultPath)
{
    return binDir(vaultPath) + "/.index.json";
}

QVariantMap readBinIndex(const QString &vaultPath)
{
    QFile f(binIndexFile(vaultPath));
    if (!f.open(QIODevice::ReadOnly))
        return {};
    const QJsonDocument doc = QJsonDocument::fromJson(f.readAll());
    f.close();
    if (!doc.isObject())
        return {};
    return doc.object().toVariantMap();
}

void writeBinIndex(const QString &vaultPath, const QVariantMap &index)
{
    QDir().mkpath(binDir(vaultPath));
    QFile f(binIndexFile(vaultPath));
    if (!f.open(QIODevice::WriteOnly | QIODevice::Truncate))
        return;
    const QJsonDocument doc(QJsonObject::fromVariantMap(index));
    f.write(doc.toJson(QJsonDocument::Indented));
    f.close();
}

QString uniquePath(const QString &desiredPath)
{
    QFileInfo info(desiredPath);
    if (!info.exists())
        return desiredPath;

    const QString dir = info.absolutePath();
    const QString base = info.completeBaseName();
    const QString suffix = info.suffix();
    const bool hasExt = !suffix.isEmpty() && info.fileName().contains('.');

    int n = 1;
    QString candidate;
    do {
        if (hasExt)
            candidate = dir + "/" + base + " (" + QString::number(n) + ")." + suffix;
        else
            candidate = dir + "/" + info.fileName() + " (" + QString::number(n) + ")";
        ++n;
    } while (QFileInfo::exists(candidate));

    return candidate;
}

} // namespace HyperLinkNotes::Core::Vault
