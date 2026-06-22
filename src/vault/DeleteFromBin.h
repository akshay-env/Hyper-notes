#ifndef DELETEFROMBIN_H
#define DELETEFROMBIN_H

#include <QString>

namespace HyperLinkNotes::Core::Vault {

// Permanently removes a binned item and drops its bin-index record. Returns
// false if removal fails.
bool deleteFromBinPermanently(const QString &vaultPath, const QString &binItemPath);

} // namespace HyperLinkNotes::Core::Vault

#endif // DELETEFROMBIN_H
