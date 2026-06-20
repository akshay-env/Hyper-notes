#include "SaveFile.h"
#include <QFile>
#include <QTextStream>

namespace HyperLinkNotes::Core::Vault {

bool saveFile(const QString &path, const QString &content)
{
    QFile file(path);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text | QIODevice::Truncate))
        return false;
    QTextStream out(&file);
    out.setEncoding(QStringConverter::Utf8);
    out << content;
    return true;
}

} // namespace HyperLinkNotes::Core::Vault
