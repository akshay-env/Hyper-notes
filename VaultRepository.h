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

    // Recycle bin
    [[nodiscard]] bool moveToBin(const QString &vaultPath, const QString &itemPath) const;
    [[nodiscard]] QVariantList getBinTree(const QString &vaultPath) const;
    [[nodiscard]] bool restoreFromBin(const QString &vaultPath, const QString &binItemPath) const;
    [[nodiscard]] bool deleteFromBinPermanently(const QString &vaultPath, const QString &binItemPath) const;
};

} // namespace HyperLinkNotes::Core

#endif // VAULTREPOSITORY_H
