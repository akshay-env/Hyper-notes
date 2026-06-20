#ifndef CREATEFOLDER_H
#define CREATEFOLDER_H

#include <QString>

namespace HyperLinkNotes::Core::Vault {
    bool createFolder(const QString &parentPath, const QString &name, QString &outCreatedPath);
}

#endif // CREATEFOLDER_H
