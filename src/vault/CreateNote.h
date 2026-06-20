#ifndef CREATENOTE_H
#define CREATENOTE_H

#include <QString>

namespace HyperLinkNotes::Core::Vault {
    bool createNote(const QString &parentPath, const QString &name, QString &outCreatedPath);
}

#endif // CREATENOTE_H
