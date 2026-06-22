#include "DeleteFromBin.h"
#include "BinIndex.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>

namespace HyperLinkNotes::Core::Vault {

bool deleteFromBinPermanently(const QString &vaultPath, const QString &binItemPath)
{
    QFileInfo info(binItemPath);
    if (!info.exists())
        return false;

    const bool ok = info.isDir() ? QDir(binItemPath).removeRecursively()
                                  : QFile::remove(binItemPath);

    if (ok && !vaultPath.isEmpty()) {
        QVariantMap idx = readBinIndex(vaultPath);
        if (idx.contains(info.fileName())) {
            idx.remove(info.fileName());
            writeBinIndex(vaultPath, idx);
        }
    }
    return ok;
}

} // namespace HyperLinkNotes::Core::Vault
