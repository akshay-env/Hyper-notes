#include "CalculateCollision.h"
#include <cmath>
#include <vector>
#include <algorithm>
#include <QRandomGenerator>

namespace HyperLinkNotes::Core::Physics {

// d3-force collision: position-based, does NOT scale with alpha. Uses predicted
// positions (x + vx) like d3's collide force.
//
// The interaction radius is fixed (2 * radius), so a uniform spatial grid keyed
// on predicted position turns the old O(n²) all-pairs scan into ~O(n): each node
// only tests the nodes in its own and 8 neighbouring cells.
void calculateCollision(QVector<PhysicsNode>& nodes, float radius, float collisionStrength)
{
    const int count = nodes.size();
    if (count < 2) return;

    const float combinedRadius   = radius * 2.0f;
    const float combinedRadiusSq = combinedRadius * combinedRadius;
    const float cellSize = (combinedRadius > 0.0f) ? combinedRadius : 1.0f;

    // Predicted positions and bounding box.
    static thread_local std::vector<float> px, py;
    px.resize(count);
    py.resize(count);
    float minX, minY, maxX, maxY;
    px[0] = nodes[0].x + nodes[0].vx;
    py[0] = nodes[0].y + nodes[0].vy;
    minX = maxX = px[0];
    minY = maxY = py[0];
    for (int i = 1; i < count; ++i) {
        px[i] = nodes[i].x + nodes[i].vx;
        py[i] = nodes[i].y + nodes[i].vy;
        minX = std::min(minX, px[i]); maxX = std::max(maxX, px[i]);
        minY = std::min(minY, py[i]); maxY = std::max(maxY, py[i]);
    }

    int gw = static_cast<int>((maxX - minX) / cellSize) + 1;
    int gh = static_cast<int>((maxY - minY) / cellSize) + 1;
    gw = std::max(1, gw);
    gh = std::max(1, gh);

    // Guard against a pathologically sparse grid blowing up memory; fall back to
    // brute force in that (rare) case.
    const long long cellCount = static_cast<long long>(gw) * gh;
    const bool useGrid = cellCount <= static_cast<long long>(4) * count + 4096;

    auto resolve = [&](int i, int j) {
        float dx = px[i] - px[j];
        float dy = py[i] - py[j];
        float distSq = dx * dx + dy * dy;
        if (distSq >= combinedRadiusSq) return;

        if (distSq < 1e-6f) {
            dx = QRandomGenerator::global()->bounded(100) / 1000.0f + 0.01f;
            dy = QRandomGenerator::global()->bounded(100) / 1000.0f + 0.01f;
            distSq = dx * dx + dy * dy;
        }
        const float dist    = std::sqrt(distSq);
        const float overlap = combinedRadius - dist;
        const float impulse = (overlap / dist) * collisionStrength * 0.5f;
        const float fx = dx * impulse;
        const float fy = dy * impulse;
        nodes[i].fx += fx; nodes[i].fy += fy;
        nodes[j].fx -= fx; nodes[j].fy -= fy;
    };

    if (!useGrid) {
        for (int i = 0; i < count; ++i)
            for (int j = i + 1; j < count; ++j)
                resolve(i, j);
        return;
    }

    // Bucket node indices into grid cells (reused across ticks).
    static thread_local std::vector<std::vector<int>> grid;
    if (static_cast<int>(grid.size()) < gw * gh)
        grid.resize(gw * gh);
    for (int k = 0; k < gw * gh; ++k)
        grid[k].clear();

    auto cellIndex = [&](int i) {
        int cx = static_cast<int>((px[i] - minX) / cellSize);
        int cy = static_cast<int>((py[i] - minY) / cellSize);
        cx = std::min(std::max(cx, 0), gw - 1);
        cy = std::min(std::max(cy, 0), gh - 1);
        return cy * gw + cx;
    };
    for (int i = 0; i < count; ++i)
        grid[cellIndex(i)].push_back(i);

    // For each node, test its own + 8 neighbouring cells. Each pair is resolved
    // once by only acting when the other index is greater.
    for (int i = 0; i < count; ++i) {
        const int cx = std::min(std::max(static_cast<int>((px[i] - minX) / cellSize), 0), gw - 1);
        const int cy = std::min(std::max(static_cast<int>((py[i] - minY) / cellSize), 0), gh - 1);
        for (int ny = std::max(0, cy - 1); ny <= std::min(gh - 1, cy + 1); ++ny) {
            for (int nx = std::max(0, cx - 1); nx <= std::min(gw - 1, cx + 1); ++nx) {
                const std::vector<int>& bucket = grid[ny * gw + nx];
                for (int j : bucket)
                    if (j > i) resolve(i, j);
            }
        }
    }
}

} // namespace HyperLinkNotes::Core::Physics
