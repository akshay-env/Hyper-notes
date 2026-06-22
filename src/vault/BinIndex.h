#ifndef BININDEX_H
#define BININDEX_H

#include <QString>
#include <QVariantMap>

namespace HyperLinkNotes::Core::Vault {

// The recycle bin lives at <vault>/.bin (skipped by ScanDirectory). A small
// JSON sidecar, <vault>/.bin/.index.json, maps each top-level binned entry name
// to the absolute path it was deleted from, so it can be restored later.

QString binDir(const QString &vaultPath);
QString binIndexFile(const QString &vaultPath);

QVariantMap readBinIndex(const QString &vaultPath);
void writeBinIndex(const QString &vaultPath, const QVariantMap &index);

// Returns a non-colliding variant of desiredPath by appending " (n)" before the
// extension (or to the folder name) until the path is free.
QString uniquePath(const QString &desiredPath);

} // namespace HyperLinkNotes::Core::Vault

#endif // BININDEX_H
