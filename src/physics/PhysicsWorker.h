#ifndef PHYSICSWORKER_H
#define PHYSICSWORKER_H

#include <QObject>
#include <QVector>
#include <QHash>
#include <QString>
#include <QMutex>
#include <QAtomicInt>
#include <QVariantList>
#include "PhysicsTypes.h"

class QTimer;

namespace HyperLinkNotes::Core {

// Runs the force simulation on a background thread. The authoritative node
// state lives here and is only ever touched from the worker thread. Only the
// flat position snapshot (m_sharedPos) and the drag input are shared with the
// main thread, each guarded by a mutex.
class PhysicsWorker : public QObject {
    Q_OBJECT

public:
    explicit PhysicsWorker(QObject* parent = nullptr);
    ~PhysicsWorker() override;

    // Thread-safe: callable from the main thread. Touches only the locked snapshot.
    void snapshot(QVector<float>& out);
    void clearPending();

    // High-frequency drag input. Thread-safe (lock-guarded) and coalesced: the
    // worker applies the latest target on its next tick. This is deliberately
    // NOT a queued slot — one event per mouse move floods the worker's event
    // loop and starves the physics QTimer (the cause of "everything freezes
    // while I drag a node").
    void setDragTarget(const QString& id, float x, float y);

public slots:
    void start();   // creates + starts the tick timer (runs in the worker thread)
    void stop();
    void setup(const QVariantList& nodes, const QVariantList& edges);
    void beginDrag(const QString& id);  // pin the node + hold the sim warm (once)
    void endDrag(const QString& id);    // unpin the node + let the sim settle (once)
    void reheat();

signals:
    void positionsReady();

private:
    void tick();
    void writeSnapshot();
    void applyDragTarget();   // pull the coalesced drag target into m_nodes

    QVector<Physics::PhysicsNode> m_nodes;   // authoritative — worker thread only
    QVector<Physics::PhysicsEdge> m_edges;
    QHash<QString, int> m_idToIndex;

    QTimer* m_timer = nullptr;

    // d3-force alpha integration: alpha eases toward alphaTarget every tick.
    // alphaTarget is 0 normally (cools to rest) and 0.3 while dragging (stays warm).
    float m_alpha       = 1.0f;
    float m_alphaTarget = 0.0f;
    static constexpr float kAlphaMin   = 0.001f;
    static constexpr float kAlphaDecay = 0.022828f; // 1 - 0.001^(1/300)

    // Exact d3-force defaults (mirrors Obsidian's sim.js)
    float m_repulsionStrength = 1000.0f;
    float m_springStiffness   = 1.0f;
    float m_targetLength      = 250.0f;
    float m_gravityStrength   = 0.1f;
    float m_collisionRadius   = 60.0f;
    float m_collisionStrength = 0.5f;
    float m_damping           = 0.6f;

    // Shared position snapshot: [x0, y0, x1, y1, ...] indexed by node index.
    QMutex m_mutex;
    QVector<float> m_sharedPos;
    QAtomicInt m_syncPending{0};

    // Coalesced drag input, written by the main thread, read by the worker tick.
    QMutex  m_dragMutex;
    bool    m_dragActive    = false;
    bool    m_dragTargetSet = false;
    QString m_dragId;
    float   m_dragX = 0.0f;
    float   m_dragY = 0.0f;
};

} // namespace HyperLinkNotes::Core

#endif // PHYSICSWORKER_H
