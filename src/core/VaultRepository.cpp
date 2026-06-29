#include "VaultRepository.h"
#include "src/vault/ScanDirectory.h"
#include "src/vault/CreateFolder.h"
#include "src/vault/CreateNote.h"
#include "src/vault/IsFileNameAvailable.h"
#include "src/vault/RenameFile.h"
#include "src/vault/MoveItem.h"
#include "src/vault/ReadFile.h"
#include "src/vault/SaveFile.h"
#include "src/vault/DeleteItem.h"
#include "src/vault/MoveToBin.h"
#include "src/vault/GetBinTree.h"
#include "src/vault/RestoreFromBin.h"
#include "src/vault/DeleteFromBin.h"
#include "src/vault/UpdateLinkTargets.h"

namespace HyperLinkNotes::Core {

QVariantList VaultRepository::scanDirectory(const QString &dirPath, const QVariantMap &expandedPaths) const
{
    return Vault::scanDirectory(dirPath, expandedPaths);
}

bool VaultRepository::createFolder(const QString &parentPath, const QString &name, QString &outCreatedPath) const
{
    return Vault::createFolder(parentPath, name, outCreatedPath);
}

bool VaultRepository::createNote(const QString &parentPath, const QString &name, QString &outCreatedPath) const
{
    return Vault::createNote(parentPath, name, outCreatedPath);
}

bool VaultRepository::isFileNameAvailable(const QString &currentFilePath, const QString &newName) const
{
    return Vault::isFileNameAvailable(currentFilePath, newName);
}

QString VaultRepository::renameFile(const QString &currentFilePath, const QString &newName) const
{
    return Vault::renameFile(currentFilePath, newName);
}

QStringList VaultRepository::updateLinkTargets(const QString &vaultPath, const QString &oldTitle, const QString &newTitle) const
{
    return Vault::updateLinkTargets(vaultPath, oldTitle, newTitle);
}

bool VaultRepository::moveItem(const QString &sourcePath, const QString &destinationPath) const
{
    return Vault::moveItem(sourcePath, destinationPath);
}

QString VaultRepository::readFile(const QString &path) const
{
    return Vault::readFile(path);
}

bool VaultRepository::saveFile(const QString &path, const QString &content) const
{
    return Vault::saveFile(path, content);
}

bool VaultRepository::deleteItem(const QString &path) const
{
    return Vault::deleteItem(path);
}

bool VaultRepository::moveToBin(const QString &vaultPath, const QString &itemPath) const
{
    return Vault::moveToBin(vaultPath, itemPath);
}

QVariantList VaultRepository::getBinTree(const QString &vaultPath) const
{
    return Vault::getBinTree(vaultPath);
}

bool VaultRepository::restoreFromBin(const QString &vaultPath, const QString &binItemPath) const
{
    return Vault::restoreFromBin(vaultPath, binItemPath);
}

bool VaultRepository::deleteFromBinPermanently(const QString &vaultPath, const QString &binItemPath) const
{
    return Vault::deleteFromBinPermanently(vaultPath, binItemPath);
}

} // namespace HyperLinkNotes::Core
