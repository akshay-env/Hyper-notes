#ifndef VAULTREPOSITORY_H
#define VAULTREPOSITORY_H

#include <QString>
#include <QVariantList>
#include <QVariantMap>

namespace HyperLinkNotes::Core {

class VaultRepository
{
public:
    VaultRepository() = default;
    ~VaultRepository() = default;

    // Scanning
    [[nodiscard]] QVariantList scanDirectory(const QString &dirPath, const QVariantMap &expandedPaths) const;

    // Modifying
    [[nodiscard]] bool createFolder(const QString &parentPath, const QString &name, QString &outCreatedPath) const;
    [[nodiscard]] bool createNote(const QString &parentPath, const QString &name, QString &outCreatedPath) const;
    [[nodiscard]] bool moveItem(const QString &sourcePath, const QString &destinationPath) const;
    [[nodiscard]] bool isFileNameAvailable(const QString &currentFilePath, const QString &newName) const;
    [[nodiscard]] QString renameFile(const QString &currentFilePath, const QString &newName) const;
    
    // I/O
    [[nodiscard]] QString readFile(const QString &path) const;
    [[nodiscard]] bool saveFile(const QString &path, const QString &content) const;

    // Deletion
    [[nodiscard]] bool deleteItem(const QString &path) const;
};

} // namespace HyperLinkNotes::Core

#endif // VAULTREPOSITORY_H
