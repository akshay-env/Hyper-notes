#ifndef RESTOREFROMBIN_H
#define RESTOREFROMBIN_H

#include <QString>

namespace HyperLinkNotes::Core::Vault {

// Moves a binned item back to its recorded original location (or to the vault
// root if no original is known), recreating parent folders and avoiding name
// collisions. Returns false if the move fails.
bool restoreFromBin(const QString &vaultPath, const QString &binItemPath);

} // namespace HyperLinkNotes::Core::Vault

#endif // RESTOREFROMBIN_H
