#include "CreateFolder.h"
#include <QDir>

namespace HyperLinkNotes::Core::Vault {

bool createFolder(const QString &parentPath, const QString &name, QString &outCreatedPath)
{
    QDir dir(parentPath);
    if (!dir.exists()) return false;

    QString folderName = name;
    int counter = 1;
    while (dir.exists(folderName))
        folderName = name + " " + QString::number(counter++);

    if (dir.mkdir(folderName)) {
        outCreatedPath = dir.absoluteFilePath(folderName);
        return true;
    }
    return false;
}

} // namespace HyperLinkNotes::Core::Vault
