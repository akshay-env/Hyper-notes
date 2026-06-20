#pragma once
#include "PhysicsTypes.h"
#include <QVector>

namespace HyperLinkNotes::Core::Physics {

void calculateCollision(QVector<PhysicsNode>& nodes, float radius, float collisionStrength);

} // namespace HyperLinkNotes::Core::Physics
