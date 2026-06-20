#include "CalculateCollision.h"
#include <cmath>
#include <QRandomGenerator>

namespace HyperLinkNotes::Core::Physics {

// d3-force collision: position-based, does NOT scale with alpha.
// Uses predicted positions (x + vx) like d3's collide force.
void calculateCollision(QVector<PhysicsNode>& nodes, float radius, float collisionStrength)
{
    const int count = nodes.size();
    const float combinedRadius = radius * 2.0f;
    const float combinedRadiusSq = combinedRadius * combinedRadius;

    for (int i = 0; i < count; ++i) {
        for (int j = i + 1; j < count; ++j) {
            PhysicsNode& a = nodes[i];
            PhysicsNode& b = nodes[j];

            // d3: use predicted positions (x + vx)
            float dx = (a.x + a.vx) - (b.x + b.vx);
            float dy = (a.y + a.vy) - (b.y + b.vy);
            float distSq = dx * dx + dy * dy;

            if (distSq < combinedRadiusSq) {
                if (distSq < 1e-6f) {
                    dx = QRandomGenerator::global()->bounded(100) / 1000.0f + 0.01f;
                    dy = QRandomGenerator::global()->bounded(100) / 1000.0f + 0.01f;
                    distSq = dx * dx + dy * dy;
                }

                float dist    = std::sqrt(distSq);
                float overlap = combinedRadius - dist;

                // d3: impulse = (overlap / dist) * strength, split 50/50
                float impulse = (overlap / dist) * collisionStrength * 0.5f;

                float fx = dx * impulse;
                float fy = dy * impulse;

                a.fx += fx;
                a.fy += fy;
                b.fx -= fx;
                b.fy -= fy;
            }
        }
    }
}

} // namespace HyperLinkNotes::Core::Physics
