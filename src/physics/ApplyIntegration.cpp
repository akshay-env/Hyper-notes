#include "ApplyIntegration.h"

namespace HyperLinkNotes::Core::Physics {

// d3-force style integration: forces add to velocity (Δv), not to acceleration.
// No dt — physics is iteration-based (one tick per frame), matching Obsidian exactly.
void applyIntegration(QVector<PhysicsNode>& nodes, float damping)
{
    for (PhysicsNode& node : nodes) {
        if (node.isPinned) {
            node.fx = 0.0f;
            node.fy = 0.0f;
            node.vx = 0.0f;
            node.vy = 0.0f;
            continue;
        }

        // Velocity delta: accumulated Δv from all forces this tick
        node.vx += node.fx;
        node.vy += node.fy;

        // Damping: d3 retains 60% velocity each tick (velDecay = 0.6)
        node.vx *= damping;
        node.vy *= damping;

        // Safety cap against numeric explosions
        const float maxSpeed = 500.0f;
        if (node.vx >  maxSpeed) node.vx =  maxSpeed;
        if (node.vx < -maxSpeed) node.vx = -maxSpeed;
        if (node.vy >  maxSpeed) node.vy =  maxSpeed;
        if (node.vy < -maxSpeed) node.vy = -maxSpeed;

        // Position update — no dt, matches d3's x += vx
        node.x += node.vx;
        node.y += node.vy;

        // Reset Δv accumulators for next tick
        node.fx = 0.0f;
        node.fy = 0.0f;
    }
}

} // namespace HyperLinkNotes::Core::Physics
