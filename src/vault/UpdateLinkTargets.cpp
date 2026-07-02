#include "UpdateLinkTargets.h"

#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QRegularExpression>

namespace HyperLinkNotes::Core::Vault {

namespace {

// Repoints any [[…]] target equal to oldTitle within a single note's content.
// Single [[X]] → X is the target. [[label|A|B]] → label is display-only, the
// pipe-separated rest are targets. Sets `changed` if anything was rewritten.
QString rewrite(const QString &content, const QString &oldTitle, const QString &newTitle, bool &changed)
{
    static const QRegularExpression re(QStringLiteral("\\[\\[([^\\]\\n]+?)\\]\\]"));
    QString out;
    int last = 0;
    auto it = re.globalMatch(content);
    while (it.hasNext()) {
        const QRegularExpressionMatch m = it.next();
        out += content.mid(last, m.capturedStart() - last);

        const QString inner = m.captured(1);
        const int pipe = inner.indexOf(QLatin1Char('|'));
        QString newInner;
        if (pipe == -1) {
            if (inner.trimmed() == oldTitle) { newInner = newTitle; changed = true; }
            else newInner = inner;
        } else {
            const QString label = inner.left(pipe);
            QStringList parts = inner.mid(pipe + 1).split(QLatin1Char('|'));
            for (QString &p : parts) {
                if (p.trimmed() == oldTitle) { p = newTitle; changed = true; }
            }
            newInner = label + QLatin1Char('|') + parts.join(QLatin1Char('|'));
        }
        out += QStringLiteral("[[") + newInner + QStringLiteral("]]");
        last = m.capturedEnd();
    }
    out += content.mid(last);
    return out;
}

// Repoints the `parent:` value in a note's leading YAML frontmatter when it
// equals oldTitle. The branch trail (child's `parent` = its source note) is
// title-based like [[links]], so a rename must rewrite it here too — otherwise
// renaming an ancestor silently severs the AI-context chain for its descendants.
QString rewriteParent(const QString &content, const QString &oldTitle, const QString &newTitle, bool &changed)
{
    // Leading ---\n … \n--- block only.
    static const QRegularExpression fm(
        QStringLiteral("\\A---[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n---[ \\t]*(?:\\r?\\n|\\z)"));
    const QRegularExpressionMatch fmM = fm.match(content);
    if (!fmM.hasMatch()) return content;

    const QString block = fmM.captured(1);
    // A `parent:` line, capturing the key+ws (2) and the value (3) separately.
    static const QRegularExpression pk(
        QStringLiteral("(^|\\n)([ \\t]*parent[ \\t]*:[ \\t]*)([^\\r\\n]*)"));
    const QRegularExpressionMatch pm = pk.match(block);
    if (!pm.hasMatch()) return content;

    QString value = pm.captured(3).trimmed();
    // Strip a single pair of wrapping quotes before comparing.
    if (value.size() >= 2
        && ((value.startsWith(QLatin1Char('"')) && value.endsWith(QLatin1Char('"')))
         || (value.startsWith(QLatin1Char('\'')) && value.endsWith(QLatin1Char('\'')))))
        value = value.mid(1, value.size() - 2);
    if (value != oldTitle) return content;

    const QString newBlock = block.left(pm.capturedStart())
        + pm.captured(1) + pm.captured(2) + newTitle
        + block.mid(pm.capturedEnd());

    QString out = content;
    out.replace(fmM.capturedStart(1), fmM.capturedLength(1), newBlock);
    changed = true;
    return out;
}

} // namespace

QStringList updateLinkTargets(const QString &vaultPath, const QString &oldTitle, const QString &newTitle)
{
    QStringList changedPaths;
    if (vaultPath.isEmpty() || oldTitle.isEmpty() || newTitle.isEmpty() || oldTitle == newTitle)
        return changedPaths;

    QDirIterator it(vaultPath, QStringList{ QStringLiteral("*.md") }, QDir::Files, QDirIterator::Subdirectories);
    while (it.hasNext()) {
        const QString path = it.next();
        if (path.contains(QStringLiteral("/.bin/")) || path.contains(QStringLiteral("\\.bin\\")))
            continue; // never touch trashed notes

        QFile in(path);
        if (!in.open(QIODevice::ReadOnly | QIODevice::Text)) continue;
        const QString content = QString::fromUtf8(in.readAll());
        in.close();

        bool changed = false;
        QString updated = rewrite(content, oldTitle, newTitle, changed);
        updated = rewriteParent(updated, oldTitle, newTitle, changed);
        if (!changed) continue;

        QFile out(path);
        if (out.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) {
            out.write(updated.toUtf8());
            out.close();
            changedPaths << path;
        }
    }
    return changedPaths;
}

} // namespace HyperLinkNotes::Core::Vault
