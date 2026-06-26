#include "ForceSimulation.h"
#include <QVariantMap>
#include <QRandomGenerator>

namespace HyperLinkNotes::Core {

ForceSimulation::ForceSimulation(QObject *parent) : QObject(parent)
{
    m_worker = new PhysicsWorker;   // no parent — ownership transfers to the thread
    m_worker->moveToThread(&m_thread);

    connect(&m_thread, &QThread::finished, m_worker, &QObject::deleteLater);
    connect(m_worker, &PhysicsWorker::positionsReady,
            this, &ForceSimulation::onPositionsReady, Qt::QueuedConnection);

    m_thread.start();
}

ForceSimulation::~ForceSimulation()
{
    m_thread.quit();
    m_thread.wait();
}

void ForceSimulation::init(const QVariantList& nodes, const QVariantList& edges)
{
    // Preserve positions of nodes that persist across a re-init
    QHash<QString, Physics::PhysicsNode> old;
    for (const auto& n : m_nodes)
        old.insert(n.id, n);

    m_nodes.clear();
    m_edges.clear();
    m_idToIndex.clear();

    // Compute initial positions on the main thread and hand the SAME values to
    // the worker so both sides agree from frame one (no first-frame jump).
    QVariantList nodesWithPos;
    nodesWithPos.reserve(nodes.size());

    for (int i = 0; i < nodes.size(); ++i) {
        QVariantMap nm = nodes[i].toMap();
        Physics::PhysicsNode pn;
        pn.id = nm.value("id").toString();

        if (old.contains(pn.id)) {
            pn.x = old.value(pn.id).x;
            pn.y = old.value(pn.id).y;
        } else if (nm.contains("x") && nm.contains("y")) {
            pn.x = nm.value("x").toFloat();
            pn.y = nm.value("y").toFloat();
        } else {
            pn.x = QRandomGenerator::global()->bounded(400) - 200;
            pn.y = QRandomGenerator::global()->bounded(400) - 200;
        }

        m_idToIndex.insert(pn.id, i);
        m_nodes.push_back(pn);

        nm["x"] = pn.x;
        nm["y"] = pn.y;
        nodesWithPos.push_back(nm);
    }

    for (const QVariant& ev : edges) {
        QVariantMap em = ev.toMap();
        const QString from = em.value("from").toString();
        const QString to   = em.value("to").toString();
        if (m_idToIndex.contains(from) && m_idToIndex.contains(to)) {
            Physics::PhysicsEdge pe;
            pe.sourceIndex = m_idToIndex.value(from);
            pe.targetIndex = m_idToIndex.value(to);
            m_edges.push_back(pe);
        }
    }

    // Push the graph to the worker thread (it owns the live simulation)
    QMetaObject::invokeMethod(m_worker, "setup", Qt::QueuedConnection,
                              Q_ARG(QVariantList, nodesWithPos),
                              Q_ARG(QVariantList, edges));

    m_tickCount++;
    emit positionsUpdated();   // render initial layout right away
}

void ForceSimulation::step(float /*dt*/)
{
    // No-op: the worker thread drives the simulation now.
}

void ForceSimulation::clear()
{
    m_nodes.clear();
    m_edges.clear();
    m_idToIndex.clear();
    QMetaObject::invokeMethod(m_worker, "clear", Qt::QueuedConnection);
    m_tickCount++;
    emit positionsUpdated();
}

void ForceSimulation::addNodes(const QVariantList& nodes, const QVariantList& edges)
{
    // Mirror the additions on the main thread so the edge renderer and the
    // index-based position reads stay valid. Node maps carry id/x/y.
    for (const QVariant& nv : nodes) {
        QVariantMap nm = nv.toMap();
        Physics::PhysicsNode pn;
        pn.id = nm.value("id").toString();
        if (pn.id.isEmpty() || m_idToIndex.contains(pn.id))
            continue;
        pn.x = nm.value("x").toFloat();
        pn.y = nm.value("y").toFloat();
        m_idToIndex.insert(pn.id, m_nodes.size());
        m_nodes.push_back(pn);
    }

    for (const QVariant& ev : edges) {
        QVariantMap em = ev.toMap();
        const QString from = em.value("from").toString();
        const QString to   = em.value("to").toString();
        if (m_idToIndex.contains(from) && m_idToIndex.contains(to)) {
            Physics::PhysicsEdge pe;
            pe.sourceIndex = m_idToIndex.value(from);
            pe.targetIndex = m_idToIndex.value(to);
            m_edges.push_back(pe);
        }
    }

    QMetaObject::invokeMethod(m_worker, "addNodes", Qt::QueuedConnection,
                              Q_ARG(QVariantList, nodes), Q_ARG(QVariantList, edges));
    m_tickCount++;
    emit positionsUpdated();
}

void ForceSimulation::onPositionsReady()
{
    QVector<float> pos;
    m_worker->snapshot(pos);
    m_worker->clearPending();

    const int n = m_nodes.size();
    if (pos.size() >= n * 2) {
        for (int i = 0; i < n; ++i) {
            m_nodes[i].x = pos[2 * i];
            m_nodes[i].y = pos[2 * i + 1];
        }
    }

    m_tickCount++;
    emit positionsUpdated();
}

float ForceSimulation::getNodeX(const QString& id) const
{
    auto it = m_idToIndex.constFind(id);
    if (it != m_idToIndex.constEnd()) return m_nodes[it.value()].x;
    return 0.0f;
}

float ForceSimulation::getNodeY(const QString& id) const
{
    auto it = m_idToIndex.constFind(id);
    if (it != m_idToIndex.constEnd()) return m_nodes[it.value()].y;
    return 0.0f;
}

float ForceSimulation::getNodeXAt(int index) const
{
    if (index >= 0 && index < m_nodes.size()) return m_nodes[index].x;
    return 0.0f;
}

float ForceSimulation::getNodeYAt(int index) const
{
    if (index >= 0 && index < m_nodes.size()) return m_nodes[index].y;
    return 0.0f;
}

void ForceSimulation::setTickIntervalMs(int ms)
{
    QMetaObject::invokeMethod(m_worker, "setTickInterval", Qt::QueuedConnection,
                              Q_ARG(int, ms));
}

void ForceSimulation::setNodePosition(const QString& id, float x, float y)
{
    // Called on every mouse move during a drag. Hand the target to the worker
    // via a lock-guarded, coalesced channel — NOT a per-move queued invocation,
    // which floods the worker's event loop and starves its physics timer (the
    // bug where every other node froze while dragging). The 60 Hz worker loop
    // pins the node and pushes the result back, so no synchronous emit is needed.
    m_worker->setDragTarget(id, x, y);
}

void ForceSimulation::setNodePinned(const QString& id, bool pinned)
{
    // Drag start/finish are one-shot, so a queued call is fine here.
    if (pinned)
        QMetaObject::invokeMethod(m_worker, "beginDrag", Qt::QueuedConnection,
                                  Q_ARG(QString, id));
    else
        QMetaObject::invokeMethod(m_worker, "endDrag", Qt::QueuedConnection,
                                  Q_ARG(QString, id));
}

void ForceSimulation::reheat()
{
    QMetaObject::invokeMethod(m_worker, "reheat", Qt::QueuedConnection);
}

int ForceSimulation::indexForId(const QString& id) const
{
    return m_idToIndex.value(id, -1);
}

const QVector<Physics::PhysicsNode>& ForceSimulation::nodes() const
{
    return m_nodes;
}

const QVector<Physics::PhysicsEdge>& ForceSimulation::edges() const
{
    return m_edges;
}

} // namespace HyperLinkNotes::Core
