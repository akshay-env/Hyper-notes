#include "CalculateGravity.h"

namespace HyperLinkNotes::Core::Physics {

void calculateGravity(QVector<PhysicsNode>& nodes, float gravityStrength, float centerX, float centerY)
{
    for (PhysicsNode& node : nodes) {
        float dx = centerX - node.x;
        float dy = centerY - node.y;
        
        node.fx += dx * gravityStrength;
        node.fy += dy * gravityStrength;
    }
}

} // namespace HyperLinkNotes::Core::Physics
