#ifndef SAVEFILE_H
#define SAVEFILE_H

#include <QString>

namespace HyperLinkNotes::Core::Vault {
    bool saveFile(const QString &path, const QString &content);
}

#endif // SAVEFILE_H
