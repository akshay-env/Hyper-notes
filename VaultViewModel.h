#ifndef VAULTVIEWMODEL_H
#define VAULTVIEWMODEL_H

#include <QObject>
#include <QString>
#include <QVariantList>
#include <QSet>
#include <QtQml/qqmlregistration.h>
#include "VaultRepository.h"

namespace HyperLinkNotes::ViewModel {

class VaultViewModel : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QString vaultPath READ vaultPath WRITE setVaultPath NOTIFY vaultPathChanged)

public:
    explicit VaultViewModel(QObject *parent = nullptr);
    ~VaultViewModel() override = default;

    [[nodiscard]] QString vaultPath() const noexcept;
    void setVaultPath(const QString &path);

    // Vault tree
    Q_INVOKABLE [[nodiscard]] QVariantList getVaultTree() const;
    Q_INVOKABLE bool createFolder(const QString &parentPath, const QString &name);
    Q_INVOKABLE bool createNote(const QString &parentPath, const QString &name);
    Q_INVOKABLE bool moveItem(const QString &sourcePath, const QString &destinationPath);
    Q_INVOKABLE [[nodiscard]] bool isFileNameAvailable(const QString &currentFilePath, const QString &newName) const;
    Q_INVOKABLE QString renameFile(const QString &currentFilePath, const QString &newName);

    // File I/O and UI State
    Q_INVOKABLE void setExpanded(const QString &path, bool expanded);
    Q_INVOKABLE [[nodiscard]] QString readFile(const QString &path) const;
    Q_INVOKABLE bool saveFile(const QString &path, const QString &content) const;
    Q_INVOKABLE [[nodiscard]] QString getLastCreatedPath() const noexcept;

    // Deletion
    Q_INVOKABLE bool deleteItem(const QString &path);

signals:
    void vaultPathChanged();

private:
    Core::VaultRepository m_repository;
    QString m_vaultPath;
    QString m_lastCreatedPath;
    QSet<QString> m_expandedPaths;
};

} // namespace HyperLinkNotes::ViewModel

#endif // VAULTVIEWMODEL_H
