#include "MoveItem.h"
#include <QDir>
#include <QFile>
#include <QFileInfo>

namespace HyperLinkNotes::Core::Vault {

bool moveItem(const QString &sourcePath, const QString &destinationPath)
{
    QFileInfo srcInfo(sourcePath);
    if (!srcInfo.exists()) return false;

    QDir destDir(destinationPath);
    if (!destDir.exists()) return false;

    QString destFilePath = destDir.absoluteFilePath(srcInfo.fileName());
    if (destFilePath.startsWith(sourcePath + "/")) return false; // no drop into self

    if (srcInfo.isDir()) {
        QDir dir;
        return dir.rename(sourcePath, destFilePath);
    } else {
        return QFile::rename(sourcePath, destFilePath);
    }
}

} // namespace HyperLinkNotes::Core::Vault
