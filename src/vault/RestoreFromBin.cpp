#include "RestoreFromBin.h"
#include "BinIndex.h"

#include <QDir>
#include <QFileInfo>

namespace HyperLinkNotes::Core::Vault {

bool restoreFromBin(const QString &vaultPath, const QString &binItemPath)
{
    if (vaultPath.isEmpty())
        return false;

    QFileInfo info(binItemPath);
    if (!info.exists())
        return false;

    const QString dir = binDir(vaultPath);
    const QString entryName = info.fileName();
    QVariantMap idx = readBinIndex(vaultPath);

    const bool isTopLevel =
        QDir(info.absolutePath()).absolutePath() == QDir(dir).absolutePath();

    QString original;
    if (isTopLevel)
        original = idx.value(entryName).toString();

    QString dest = !original.isEmpty() ? original : (vaultPath + "/" + entryName);
    QDir().mkpath(QFileInfo(dest).absolutePath());
    dest = uniquePath(dest);

    if (!QDir().rename(binItemPath, dest))
        return false;

    if (isTopLevel && idx.contains(entryName)) {
        idx.remove(entryName);
        writeBinIndex(vaultPath, idx);
    }
    return true;
}

} // namespace HyperLinkNotes::Core::Vault
