#include "IsFileNameAvailable.h"
#include <QDir>
#include <QFileInfo>

namespace HyperLinkNotes::Core::Vault {

bool isFileNameAvailable(const QString &currentFilePath, const QString &newName)
{
    QFileInfo currentInfo(currentFilePath);
    if (!currentInfo.exists()) return false;
    
    QDir dir = currentInfo.absoluteDir();
    QString baseName = newName;
    if (baseName.endsWith(".md") || baseName.endsWith(".txt"))
        baseName = baseName.left(baseName.lastIndexOf('.'));
    
    QString newFileName = baseName + ".md";
    if (newFileName.compare(currentInfo.fileName(), Qt::CaseInsensitive) == 0)
        return true;
        
    return !dir.exists(newFileName);
}

} // namespace HyperLinkNotes::Core::Vault
