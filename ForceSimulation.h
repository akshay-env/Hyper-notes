#ifndef FORCESIMULATION_H
#define FORCESIMULATION_H

#include <QObject>
#include <QThread>
#include <QVariantList>
#include <QVector>
#include <QHash>
#include <QtQml/qqmlregistration.h>
#include "src/physics/PhysicsTypes.h"
#include "src/physics/PhysicsWorker.h"

namespace HyperLinkNotes::Core {

// Main-thread facade. Owns the worker thread that runs the actual simulation,
// and keeps a main-thread mirror of node positions for QML bindings and the
// scene-graph renderer to read.
class ForceSimulation : public QObject {
    Q_OBJECT
    QML_ELEMENT

public:
    explicit ForceSimulation(QObject *parent = nullptr);
    ~ForceSimulation() override;

    Q_INVOKABLE void init(const QVariantList& nodes, const QVariantList& edges);
    Q_INVOKABLE void step(float dt);   // kept for QML compatibility; now a no-op

    Q_INVOKABLE float getNodeX(const QString& id) const;
    Q_INVOKABLE float getNodeY(const QString& id) const;

    Q_INVOKABLE void setNodePosition(const QString& id, float x, float y);
    Q_INVOKABLE void setNodePinned(const QString& id, bool pinned);
    Q_INVOKABLE void reheat();

    // Index of a node id in the position arrays, or -1. Read during scene-graph
    // sync (main thread blocked), safe for the renderer to call.
    int indexForId(const QString& id) const;

    const QVector<Physics::PhysicsNode>& nodes() const;
    const QVector<Physics::PhysicsEdge>& edges() const;

    Q_PROPERTY(int tickCount MEMBER m_tickCount NOTIFY positionsUpdated)

signals:
    void positionsUpdated();   // emitted on the main thread after each sync

private slots:
    void onPositionsReady();

private:
    PhysicsWorker* m_worker = nullptr;
    QThread m_thread;

    // Main-thread mirror (index order matches the worker exactly)
    QVector<Physics::PhysicsNode> m_nodes;
    QVector<Physics::PhysicsEdge> m_edges;
    QHash<QString, int> m_idToIndex;

    int m_tickCount = 0;
};

} // namespace HyperLinkNotes::Core

#endif // FORCESIMULATION_H
