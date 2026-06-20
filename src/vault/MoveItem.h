#ifndef MOVEITEM_H
#define MOVEITEM_H

#include <QString>

namespace HyperLinkNotes::Core::Vault {
    bool moveItem(const QString &sourcePath, const QString &destinationPath);
}

#endif // MOVEITEM_H
