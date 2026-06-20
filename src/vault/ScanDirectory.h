#ifndef SCANDIRECTORY_H
#define SCANDIRECTORY_H

#include <QVariantList>
#include <QVariantMap>
#include <QString>

namespace HyperLinkNotes::Core::Vault {
    QVariantList scanDirectory(const QString &dirPath, const QVariantMap &expandedPaths);
}

#endif // SCANDIRECTORY_H
