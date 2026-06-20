#include "ReadFile.h"
#include <QFile>
#include <QTextStream>

namespace HyperLinkNotes::Core::Vault {

QString readFile(const QString &path)
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text))
        return QString();
    QTextStream in(&file);
    in.setEncoding(QStringConverter::Utf8);
    return in.readAll();
}

} // namespace HyperLinkNotes::Core::Vault
