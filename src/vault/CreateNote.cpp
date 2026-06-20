#include "CreateNote.h"
#include <QDir>
#include <QFile>

namespace HyperLinkNotes::Core::Vault {

bool createNote(const QString &parentPath, const QString &name, QString &outCreatedPath)
{
    QDir dir(parentPath);
    if (!dir.exists()) return false;

    QString baseName = name;
    if (baseName.endsWith(".md") || baseName.endsWith(".txt"))
        baseName = baseName.left(baseName.lastIndexOf('.'));

    QString fileName = baseName + ".md";
    int counter = 1;
    while (dir.exists(fileName))
        fileName = baseName + " " + QString::number(counter++) + ".md";

    QString filePath = dir.absoluteFilePath(fileName);
    QFile file(filePath);
    if (file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        file.write("");
        file.close();
        outCreatedPath = filePath;
        return true;
    }
    return false;
}

} // namespace HyperLinkNotes::Core::Vault
