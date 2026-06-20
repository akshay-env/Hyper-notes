#include "CalculateRepulsion.h"
#include <cmath>
#include <QRandomGenerator>

namespace HyperLinkNotes::Core::Physics {

void calculateRepulsion(QVector<PhysicsNode>& nodes, float repulsionStrength)
{
    const int count = nodes.size();
    for (int i = 0; i < count; ++i) {
        for (int j = i + 1; j < count; ++j) {
            PhysicsNode& a = nodes[i];
            PhysicsNode& b = nodes[j];

            float dx = a.x - b.x;
            float dy = a.y - b.y;
            float distSq = dx * dx + dy * dy;

            // Avoid division by zero and infinite forces
            if (distSq < 0.0001f) {
                dx = QRandomGenerator::global()->bounded(100) / 1000.0f;
                dy = QRandomGenerator::global()->bounded(100) / 1000.0f;
                distSq = dx * dx + dy * dy;
            }

            float force = repulsionStrength / distSq;
            float fx = dx * force;
            float fy = dy * force;

            a.fx += fx;
            a.fy += fy;
            b.fx -= fx;
            b.fy -= fy;
        }
    }
}

} // namespace HyperLinkNotes::Core::Physics
