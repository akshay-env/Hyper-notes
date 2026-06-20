#include "CalculateSprings.h"
#include <cmath>

namespace HyperLinkNotes::Core::Physics {

// d3-force link force: uses predicted positions (x + vx) to avoid overshoot.
// springStiffness already carries the alpha scaling from the caller.
void calculateSprings(QVector<PhysicsNode>& nodes, const QVector<PhysicsEdge>& edges, float springStiffness, float targetLength)
{
    for (const PhysicsEdge& edge : edges) {
        if (edge.sourceIndex < 0 || edge.sourceIndex >= nodes.size() ||
            edge.targetIndex < 0 || edge.targetIndex >= nodes.size()) {
            continue;
        }

        PhysicsNode& source = nodes[edge.sourceIndex];
        PhysicsNode& target = nodes[edge.targetIndex];

        // d3: use predicted position (x + vx) for spring calculation
        float dx = (target.x + target.vx) - (source.x + source.vx);
        float dy = (target.y + target.vy) - (source.y + source.vy);
        float dist = std::sqrt(dx * dx + dy * dy);

        if (dist < 0.0001f) dist = 0.0001f;

        // d3 link: l = (dist - targetLength) / dist * alpha * strength
        // springStiffness carries alpha from the caller; edge.strength is the
        // per-link degree normalization (1/min(deg)) that keeps hubs stable.
        float l = (dist - targetLength) / dist * springStiffness * edge.strength;

        float dvx = dx * l;
        float dvy = dy * l;

        // d3 bias: a high-degree endpoint moves less. target gets `bias`,
        // source gets the remainder, so hubs stay put and leaves swing.
        source.fx += dvx * (1.0f - edge.bias);
        source.fy += dvy * (1.0f - edge.bias);
        target.fx -= dvx * edge.bias;
        target.fy -= dvy * edge.bias;
    }
}

} // namespace HyperLinkNotes::Core::Physics
