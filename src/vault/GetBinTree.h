#ifndef GETBINTREE_H
#define GETBINTREE_H

#include <QString>
#include <QVariantList>

namespace HyperLinkNotes::Core::Vault {

// Returns the contents of the vault's .bin folder as a tree of
// {name, path, isFolder, originalPath, children}. originalPath is populated for
// top-level entries from the bin index; nested children carry an empty string.
QVariantList getBinTree(const QString &vaultPath);

} // namespace HyperLinkNotes::Core::Vault

#endif // GETBINTREE_H
