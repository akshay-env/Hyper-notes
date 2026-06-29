#include "VaultViewModel.h"
#include <QUrl>
#include <QFileInfo>

namespace HyperLinkNotes::ViewModel {

VaultViewModel::VaultViewModel(QObject *parent)
    : QObject(parent)
{
}

QString VaultViewModel::vaultPath() const noexcept
{
    return m_vaultPath;
}

void VaultViewModel::setVaultPath(const QString &path)
{
    QString cleanPath = path;
    if (path.startsWith("file:///")) {
        cleanPath = QUrl(path).toLocalFile();
    }
    if (m_vaultPath != cleanPath) {
        m_vaultPath = cleanPath;
        emit vaultPathChanged();
    }
}

QVariantList VaultViewModel::getVaultTree() const
{
    if (m_vaultPath.isEmpty())
        return QVariantList();
        
    // We convert QSet<QString> to a QVariantMap to pass to the repository, 
    // or just change the repository to accept QVariantMap/QSet. 
    // Actually, in the repository we passed QVariantMap to avoid QtCore dependencies if possible, 
    // but QSet is fine. Wait, VaultRepository uses QVariantMap for expandedPaths.
    QVariantMap expandedMap;
    for (const QString& path : m_expandedPaths) {
        expandedMap[path] = true;
    }
    
    return m_repository.scanDirectory(m_vaultPath, expandedMap);
}

bool VaultViewModel::createFolder(const QString &parentPath, const QString &name)
{
    return m_repository.createFolder(parentPath, name, m_lastCreatedPath);
}

bool VaultViewModel::createNote(const QString &parentPath, const QString &name)
{
    return m_repository.createNote(parentPath, name, m_lastCreatedPath);
}

bool VaultViewModel::moveItem(const QString &sourcePath, const QString &destinationPath)
{
    return m_repository.moveItem(sourcePath, destinationPath);
}

bool VaultViewModel::isFileNameAvailable(const QString &currentFilePath, const QString &newName) const
{
    return m_repository.isFileNameAvailable(currentFilePath, newName);
}

QString VaultViewModel::renameFile(const QString &currentFilePath, const QString &newName)
{
    const QString oldTitle = QFileInfo(currentFilePath).completeBaseName();
    const QString newPath = m_repository.renameFile(currentFilePath, newName);

    // Renaming a note changes its title, so repoint every [[wikilink]] that
    // pointed at the old title across the whole vault — otherwise those links
    // would dangle and re-create a stale note when clicked.
    if (!newPath.isEmpty() && newPath != currentFilePath) {
        const QString newTitle = QFileInfo(newPath).completeBaseName();
        if (!oldTitle.isEmpty() && oldTitle != newTitle) {
            const QStringList changed = m_repository.updateLinkTargets(m_vaultPath, oldTitle, newTitle);
            if (!changed.isEmpty()) emit linksRepointed(changed);
        }
    }
    return newPath;
}

void VaultViewModel::setExpanded(const QString &path, bool expanded)
{
    if (expanded) m_expandedPaths.insert(path);
    else          m_expandedPaths.remove(path);
}

QString VaultViewModel::readFile(const QString &path) const
{
    return m_repository.readFile(path);
}

bool VaultViewModel::saveFile(const QString &path, const QString &content) const
{
    return m_repository.saveFile(path, content);
}

QString VaultViewModel::getLastCreatedPath() const noexcept
{
    return m_lastCreatedPath;
}

bool VaultViewModel::deleteItem(const QString &path)
{
    // Soft delete: move to the vault's recycle bin instead of removing.
    return m_repository.moveToBin(m_vaultPath, path);
}

QVariantList VaultViewModel::getBinTree() const
{
    return m_repository.getBinTree(m_vaultPath);
}

bool VaultViewModel::restoreFromBin(const QString &binItemPath)
{
    return m_repository.restoreFromBin(m_vaultPath, binItemPath);
}

bool VaultViewModel::deleteFromBinPermanently(const QString &binItemPath)
{
    return m_repository.deleteFromBinPermanently(m_vaultPath, binItemPath);
}

} // namespace HyperLinkNotes::ViewModel
