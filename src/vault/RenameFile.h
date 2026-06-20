#ifndef RENAMEFILE_H
#define RENAMEFILE_H

#include <QString>

namespace HyperLinkNotes::Core::Vault {
    QString renameFile(const QString &currentFilePath, const QString &newName);
}

#endif // RENAMEFILE_H
