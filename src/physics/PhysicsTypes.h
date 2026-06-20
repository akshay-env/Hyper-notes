#ifndef PHYSICSTYPES_H
#define PHYSICSTYPES_H

#include <QString>
#include <QVector>

namespace HyperLinkNotes::Core::Physics {

struct PhysicsNode {
    QString id;
    float x = 0.0f;
    float y = 0.0f;
    float vx = 0.0f;
    float vy = 0.0f;
    float fx = 0.0f;
    float fy = 0.0f;
    float mass = 1.0f;
    bool isPinned = false;
};

struct PhysicsEdge {
    int sourceIndex;
    int targetIndex;
    // d3-force link parameters, precomputed from node degree in PhysicsWorker::setup.
    // strength = 1 / min(deg(source), deg(target));  bias = deg(source) / (deg(source)+deg(target)).
    // Normalizing by degree is what keeps high-degree hubs numerically stable.
    float strength = 1.0f;
    float bias     = 0.5f;
};

} // namespace HyperLinkNotes::Core::Physics

#endif // PHYSICSTYPES_H
