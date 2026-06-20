#include "DeleteItem.h"
#include <QDir>
#include <QFile>
#include <QFileInfo>

namespace HyperLinkNotes::Core::Vault {

bool deleteItem(const QString &path)
{
    QFileInfo info(path);
    if (!info.exists()) return false;

    if (info.isDir()) {
        QDir dir(path);
        return dir.removeRecursively();
    } else {
        return QFile::remove(path);
    }
}

} // namespace HyperLinkNotes::Core::Vault
