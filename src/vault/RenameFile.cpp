#include "RenameFile.h"
#include <QDir>
#include <QFile>
#include <QFileInfo>

namespace HyperLinkNotes::Core::Vault {

QString renameFile(const QString &currentFilePath, const QString &newName)
{
    QFileInfo currentInfo(currentFilePath);
    if (!currentInfo.exists()) return "";
    
    QDir dir = currentInfo.absoluteDir();
    QString baseName = newName;
    if (baseName.endsWith(".md") || baseName.endsWith(".txt"))
        baseName = baseName.left(baseName.lastIndexOf('.'));
    
    QString newFileName = baseName + ".md";
    QString destFilePath = dir.absoluteFilePath(newFileName);
    
    if (newFileName.compare(currentInfo.fileName(), Qt::CaseInsensitive) == 0)
        return currentFilePath;
        
    if (QFile::rename(currentFilePath, destFilePath)) {
        return destFilePath;
    }
    return "";
}

} // namespace HyperLinkNotes::Core::Vault
