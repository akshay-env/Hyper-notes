#include "GetBinTree.h"
#include "BinIndex.h"

#include <QDir>
#include <QFileInfo>

namespace HyperLinkNotes::Core::Vault {

static QVariantList scanBin(const QString &dirPath, const QVariantMap &index, bool topLevel)
{
    QVariantList list;
    QDir dir(dirPath);
    if (!dir.exists())
        return list;

    dir.setFilter(QDir::Dirs | QDir::Files | QDir::NoDotAndDotDot);
    dir.setSorting(QDir::DirsFirst | QDir::Name | QDir::IgnoreCase);

    for (const QFileInfo &info : dir.entryInfoList()) {
        if (info.fileName() == ".index.json")
            continue;

        QVariantMap node;
        node["name"] = info.fileName();
        node["path"] = info.absoluteFilePath();
        node["isFolder"] = info.isDir();
        node["originalPath"] = topLevel ? index.value(info.fileName()).toString() : QString();
        node["children"] = info.isDir() ? scanBin(info.absoluteFilePath(), index, false) : QVariantList();
        list.append(node);
    }
    return list;
}

QVariantList getBinTree(const QString &vaultPath)
{
    if (vaultPath.isEmpty())
        return {};
    return scanBin(binDir(vaultPath), readBinIndex(vaultPath), true);
}

} // namespace HyperLinkNotes::Core::Vault
