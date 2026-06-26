#include "PhysicsWorker.h"
#include "CalculateRepulsion.h"
#include "CalculateSprings.h"
#include "CalculateGravity.h"
#include "CalculateCollision.h"
#include "ApplyIntegration.h"
#include <QTimer>
#include <QVariantMap>
#include <QRandomGenerator>

namespace HyperLinkNotes::Core {

using namespace Physics;

PhysicsWorker::PhysicsWorker(QObject* parent) : QObject(parent) {}
PhysicsWorker::~PhysicsWorker() = default;

void PhysicsWorker::start()
{
    if (!m_timer) {
        m_timer = new QTimer(this);          // created in the worker thread
        m_timer->setInterval(m_intervalMs);
        connect(m_timer, &QTimer::timeout, this, &PhysicsWorker::tick);
    }
    if (!m_timer->isActive())
        m_timer->start();
}

void PhysicsWorker::setTickInterval(int ms)
{
    m_intervalMs = qBound(1, ms, 100);
    if (m_timer)
        m_timer->setInterval(m_intervalMs);
}

void PhysicsWorker::stop()
{
    if (m_timer)
        m_timer->stop();
}

void PhysicsWorker::setup(const QVariantList& nodes, const QVariantList& edges)
{
    // Preserve momentum/pin state for nodes that survive a re-init
    QHash<QString, PhysicsNode> old;
    for (const auto& n : m_nodes)
        old.insert(n.id, n);

    m_nodes.clear();
    m_edges.clear();
    m_idToIndex.clear();

    for (int i = 0; i < nodes.size(); ++i) {
        QVariantMap nm = nodes[i].toMap();
        PhysicsNode pn;
        pn.id = nm.value("id").toString();

        const bool hadOld = old.contains(pn.id);
        if (hadOld) {
            const auto& o = old.value(pn.id);
            pn.vx = o.vx;
            pn.vy = o.vy;
            pn.isPinned = o.isPinned;
        }

        if (nm.contains("x") && nm.contains("y")) {
            pn.x = nm.value("x").toFloat();    // positions handed down from the main thread
            pn.y = nm.value("y").toFloat();
        } else if (hadOld) {
            pn.x = old.value(pn.id).x;
            pn.y = old.value(pn.id).y;
        } else {
            pn.x = QRandomGenerator::global()->bounded(400) - 200;
            pn.y = QRandomGenerator::global()->bounded(400) - 200;
        }

        m_idToIndex.insert(pn.id, i);
        m_nodes.push_back(pn);
    }

    for (const QVariant& ev : edges) {
        QVariantMap em = ev.toMap();
        const QString from = em.value("from").toString();
        const QString to   = em.value("to").toString();
        if (m_idToIndex.contains(from) && m_idToIndex.contains(to)) {
            PhysicsEdge pe;
            pe.sourceIndex = m_idToIndex.value(from);
            pe.targetIndex = m_idToIndex.value(to);
            m_edges.push_back(pe);
        }
    }

    // d3-force link force: precompute per-edge strength and bias from node degree.
    // Without this, a hub with N links accumulates ~N× the spring force each tick,
    // which is numerically unstable. Normalizing by degree bounds it — exactly d3.
    recomputeEdgeParams();

    m_alpha = 1.0f;
    m_alphaTarget = 0.0f;
    writeSnapshot();
    if (m_syncPending.testAndSetOrdered(0, 1))
        emit positionsReady();   // render the initial layout immediately
    start();
}

void PhysicsWorker::recomputeEdgeParams()
{
    QVector<int> degree(m_nodes.size(), 0);
    for (const PhysicsEdge& e : m_edges) {
        ++degree[e.sourceIndex];
        ++degree[e.targetIndex];
    }
    for (PhysicsEdge& e : m_edges) {
        const int ds = degree[e.sourceIndex];
        const int dt = degree[e.targetIndex];
        e.strength = 1.0f / static_cast<float>(qMax(1, qMin(ds, dt)));
        e.bias     = static_cast<float>(ds) / static_cast<float>(qMax(1, ds + dt));
    }
}

void PhysicsWorker::clear()
{
    if (m_timer) m_timer->stop();
    m_nodes.clear();
    m_edges.clear();
    m_idToIndex.clear();
    m_alpha = 0.0f;
    m_alphaTarget = 0.0f;
    {
        QMutexLocker lock(&m_mutex);
        m_sharedPos.clear();
    }
    if (m_syncPending.testAndSetOrdered(0, 1))
        emit positionsReady();
}

void PhysicsWorker::addNodes(const QVariantList& nodes, const QVariantList& edges)
{
    for (const QVariant& nv : nodes) {
        QVariantMap nm = nv.toMap();
        PhysicsNode pn;
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
            PhysicsEdge pe;
            pe.sourceIndex = m_idToIndex.value(from);
            pe.targetIndex = m_idToIndex.value(to);
            m_edges.push_back(pe);
        }
    }

    recomputeEdgeParams();

    // Keep the sim warm so freshly dropped nodes fly into place, without slamming
    // the whole graph back to full energy on every batch (which looks jittery).
    m_alpha = qMax(m_alpha, 0.6f);
    m_alphaTarget = 0.0f;
    writeSnapshot();
    if (m_syncPending.testAndSetOrdered(0, 1))
        emit positionsReady();
    start();
}

void PhysicsWorker::setDragTarget(const QString& id, float x, float y)
{
    // Called directly from the main thread on every mouse move. Lock-guarded and
    // coalesced — the worker reads only the latest value in applyDragTarget().
    QMutexLocker lock(&m_dragMutex);
    m_dragActive    = true;
    m_dragTargetSet = true;
    m_dragId        = id;
    m_dragX         = x;
    m_dragY         = y;
}

void PhysicsWorker::beginDrag(const QString& id)
{
    float nx = 0.0f, ny = 0.0f;
    auto it = m_idToIndex.constFind(id);
    const bool found = (it != m_idToIndex.constEnd());
    if (found) {
        m_nodes[it.value()].isPinned = true;
        nx = m_nodes[it.value()].x;
        ny = m_nodes[it.value()].y;
    }

    {
        QMutexLocker lock(&m_dragMutex);
        m_dragActive = true;
        m_dragId     = id;
        // Seed from the node only if a cursor target hasn't already arrived
        // (setDragTarget runs immediately; this queued slot may run after it).
        if (!m_dragTargetSet && found) {
            m_dragX = nx;
            m_dragY = ny;
        }
    }

    m_alphaTarget = 0.3f;   // d3: alphaTarget(0.3) on drag start — keep the sim warm
    start();
}

void PhysicsWorker::endDrag(const QString& id)
{
    auto it = m_idToIndex.constFind(id);
    if (it != m_idToIndex.constEnd())
        m_nodes[it.value()].isPinned = false;

    {
        QMutexLocker lock(&m_dragMutex);
        m_dragActive    = false;
        m_dragTargetSet = false;
        m_dragId.clear();
    }

    // d3: alphaTarget(0) on drag end. Let alpha cool naturally from its current
    // warm value (~0.3) — do NOT slam it back to 1.0, which would triple every
    // force the instant the node is released and fling the whole graph.
    m_alphaTarget = 0.0f;
    start();   // keep the timer running so it settles to rest
}

void PhysicsWorker::reheat()
{
    m_alpha = 1.0f;
    start();
}

void PhysicsWorker::applyDragTarget()
{
    QString id;
    float x, y;
    bool active;
    {
        QMutexLocker lock(&m_dragMutex);
        active = m_dragActive;
        id     = m_dragId;
        x      = m_dragX;
        y      = m_dragY;
    }
    if (!active || id.isEmpty())
        return;

    auto it = m_idToIndex.constFind(id);
    if (it != m_idToIndex.constEnd()) {
        auto& n = m_nodes[it.value()];
        n.x  = x;
        n.y  = y;
        n.vx = 0.0f;   // d3: a fixed (fx/fy) node has its velocity zeroed each tick
        n.vy = 0.0f;
    }
}

void PhysicsWorker::tick()
{
    // Pin the dragged node to the latest cursor target before computing forces,
    // so the rest of the graph reacts to it in real time (this is the whole
    // point — other nodes must keep simulating while a node is dragged).
    applyDragTarget();

    // d3-force alpha integration: alpha += (alphaTarget - alpha) * alphaDecay.
    // With alphaTarget == 0 this is the usual exponential cool-down; with
    // alphaTarget == 0.3 (during a drag) alpha settles at 0.3 and the sim stays warm.
    m_alpha += (m_alphaTarget - m_alpha) * kAlphaDecay;

    // Stop only once fully cooled AND not being held warm by a drag.
    if (m_alpha < kAlphaMin && m_alphaTarget == 0.0f) {
        m_alpha = 0.0f;
        if (m_timer) m_timer->stop();   // idle until reheated / dragged
        return;
    }

    calculateRepulsion(m_nodes, m_repulsionStrength * m_alpha);
    calculateSprings  (m_nodes, m_edges, m_springStiffness * m_alpha, m_targetLength);
    calculateGravity  (m_nodes, m_gravityStrength * m_alpha, 0.0f, 0.0f);
    calculateCollision(m_nodes, m_collisionRadius, m_collisionStrength);   // alpha-independent
    applyIntegration  (m_nodes, m_damping);

    writeSnapshot();
    // Coalesce: only post one notify until the main thread consumes it
    if (m_syncPending.testAndSetOrdered(0, 1))
        emit positionsReady();
}

void PhysicsWorker::writeSnapshot()
{
    QMutexLocker lock(&m_mutex);
    const int n = m_nodes.size();
    if (m_sharedPos.size() != n * 2)
        m_sharedPos.resize(n * 2);
    for (int i = 0; i < n; ++i) {
        m_sharedPos[2 * i]     = m_nodes[i].x;
        m_sharedPos[2 * i + 1] = m_nodes[i].y;
    }
}

void PhysicsWorker::snapshot(QVector<float>& out)
{
    QMutexLocker lock(&m_mutex);
    out = m_sharedPos;
}

void PhysicsWorker::clearPending()
{
    m_syncPending.storeRelease(0);
}

} // namespace HyperLinkNotes::Core
