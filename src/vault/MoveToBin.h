#ifndef MOVETOBIN_H
#define MOVETOBIN_H

#include <QString>

namespace HyperLinkNotes::Core::Vault {

// Soft-delete: moves itemPath into the vault's .bin folder and records its
// original location so it can be restored. Returns false if the move fails.
bool moveToBin(const QString &vaultPath, const QString &itemPath);

} // namespace HyperLinkNotes::Core::Vault

#endif // MOVETOBIN_H
