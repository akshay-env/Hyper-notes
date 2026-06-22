#include "MoveToBin.h"
#include "BinIndex.h"

#include <QDir>
#include <QFileInfo>

namespace HyperLinkNotes::Core::Vault {

bool moveToBin(const QString &vaultPath, const QString &itemPath)
{
    if (vaultPath.isEmpty())
        return false;

    QFileInfo info(itemPath);
    if (!info.exists())
        return false;

    const QString dir = binDir(vaultPath);
    QDir().mkpath(dir);

    const QString target = uniquePath(dir + "/" + info.fileName());
    const QString entryName = QFileInfo(target).fileName();

    if (!QDir().rename(itemPath, target))
        return false;

    QVariantMap idx = readBinIndex(vaultPath);
    idx[entryName] = info.absoluteFilePath();
    writeBinIndex(vaultPath, idx);
    return true;
}

} // namespace HyperLinkNotes::Core::Vault
