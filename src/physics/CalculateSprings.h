#ifndef CALCULATESPRINGS_H
#define CALCULATESPRINGS_H

#include "PhysicsTypes.h"
#include <QVector>

namespace HyperLinkNotes::Core::Physics {
    void calculateSprings(QVector<PhysicsNode>& nodes, const QVector<PhysicsEdge>& edges, float springStiffness, float targetLength);
}

#endif // CALCULATESPRINGS_H
