#ifndef ISFILENAMEAVAILABLE_H
#define ISFILENAMEAVAILABLE_H

#include <QString>

namespace HyperLinkNotes::Core::Vault {
    bool isFileNameAvailable(const QString &currentFilePath, const QString &newName);
}

#endif // ISFILENAMEAVAILABLE_H
