#ifndef CALCULATEGRAVITY_H
#define CALCULATEGRAVITY_H

#include "PhysicsTypes.h"
#include <QVector>

namespace HyperLinkNotes::Core::Physics {
    void calculateGravity(QVector<PhysicsNode>& nodes, float gravityStrength, float centerX, float centerY);
}

#endif // CALCULATEGRAVITY_H
