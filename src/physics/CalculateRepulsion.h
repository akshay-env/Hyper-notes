#ifndef CALCULATEREPULSION_H
#define CALCULATEREPULSION_H

#include "PhysicsTypes.h"
#include <QVector>

namespace HyperLinkNotes::Core::Physics {
    void calculateRepulsion(QVector<PhysicsNode>& nodes, float repulsionStrength);
}

#endif // CALCULATEREPULSION_H
