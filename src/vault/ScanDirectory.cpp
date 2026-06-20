#include "ScanDirectory.h"
#include <QDir>
#include <QFileInfo>

namespace HyperLinkNotes::Core::Vault {

QVariantList scanDirectory(const QString &dirPath, const QVariantMap &expandedPaths)
{
    QVariantList list;
    QDir dir(dirPath);
    if (!dir.exists()) return list;

    dir.setFilter(QDir::Dirs | QDir::Files | QDir::NoDotAndDotDot);
    dir.setSorting(QDir::DirsFirst | QDir::Name | QDir::IgnoreCase);

    for (const QFileInfo &info : dir.entryInfoList()) {
        if (info.fileName() == ".bin" || info.fileName() == ".obsidian")
            continue;

        QVariantMap node;
        node["name"]     = info.fileName();
        node["path"]     = info.absoluteFilePath();
        node["isFolder"] = info.isDir();
        node["expanded"] = expandedPaths.contains(info.absoluteFilePath());
        node["children"] = info.isDir() ? scanDirectory(info.absoluteFilePath(), expandedPaths) : QVariantList();
        list.append(node);
    }
    return list;
}

} // namespace HyperLinkNotes::Core::Vault
