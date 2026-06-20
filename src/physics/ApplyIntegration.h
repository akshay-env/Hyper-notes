#ifndef APPLYINTEGRATION_H
#define APPLYINTEGRATION_H

#include "PhysicsTypes.h"
#include <QVector>

namespace HyperLinkNotes::Core::Physics {
    void applyIntegration(QVector<PhysicsNode>& nodes, float damping);
}

#endif // APPLYINTEGRATION_H
