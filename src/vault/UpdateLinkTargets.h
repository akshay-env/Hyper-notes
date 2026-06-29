#ifndef UPDATELINKTARGETS_H
#define UPDATELINKTARGETS_H

#include <QString>
#include <QStringList>

namespace HyperLinkNotes::Core::Vault {

// Rewrites every [[…]] wikilink target equal to `oldTitle` → `newTitle` across all
// .md notes under `vaultPath` (the recycle bin is skipped). Labels (the display
// text before the first '|') are left alone; only link targets are repointed.
// Returns the list of file paths that were actually changed.
QStringList updateLinkTargets(const QString &vaultPath, const QString &oldTitle, const QString &newTitle);

} // namespace HyperLinkNotes::Core::Vault

#endif // UPDATELINKTARGETS_H
