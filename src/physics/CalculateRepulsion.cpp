#include "CalculateRepulsion.h"
#include <cmath>
#include <vector>
#include <algorithm>
#include <QRandomGenerator>

namespace HyperLinkNotes::Core::Physics {

// Barnes–Hut O(n log n) many-body repulsion — same math as d3-force's
// forceManyBody (which Obsidian uses), but native C++. A quadtree is built each
// tick; distant clusters are approximated by their centre of mass when a cell is
// "far enough" (theta), instead of summing every pair (the old O(n²) cost).
namespace {

constexpr float kTheta2   = 0.81f;          // d3 default theta = 0.9 → theta² = 0.81
constexpr float kDistMin2 = 30.0f * 30.0f;  // d3 distanceMin = 30 (near-field clamp)
constexpr int   kMaxDepth = 28;             // bail to a bucket for coincident points

struct Cell {
    int   child[4] = {-1, -1, -1, -1};
    int   point    = -1;        // head of coincident-point list (leaf); -1 internal/empty
    float comX = 0.0f, comY = 0.0f;
    float charge = 0.0f;
    bool  internal = false;
};

inline float jiggle() {
    return static_cast<float>((QRandomGenerator::global()->generateDouble() - 0.5) * 1e-6);
}

inline int quadrantOf(float x, float y, float x0, float y0, float half) {
    int q = 0;
    if (x >= x0 + half) q |= 1;
    if (y >= y0 + half) q |= 2;
    return q;
}

void insertPoint(std::vector<Cell>& cells, std::vector<int>& nextPt,
                 const QVector<PhysicsNode>& nodes, int ci,
                 float x0, float y0, float cw, int p, int depth)
{
    if (cells[ci].internal) {
        const float half = cw * 0.5f;
        const int q = quadrantOf(nodes[p].x, nodes[p].y, x0, y0, half);
        int ch = cells[ci].child[q];
        if (ch == -1) {
            ch = static_cast<int>(cells.size());
            cells.push_back(Cell{});       // may realloc — ci is an index, stays valid
            cells[ci].child[q] = ch;
        }
        const float nx0 = x0 + ((q & 1) ? half : 0.0f);
        const float ny0 = y0 + ((q & 2) ? half : 0.0f);
        insertPoint(cells, nextPt, nodes, ch, nx0, ny0, half, p, depth + 1);
        return;
    }

    if (cells[ci].point == -1) {           // empty leaf
        cells[ci].point = p;
        nextPt[p] = -1;
        return;
    }

    // Occupied leaf
    const int existing = cells[ci].point;
    const bool coincident = std::fabs(nodes[existing].x - nodes[p].x) < 1e-4f &&
                            std::fabs(nodes[existing].y - nodes[p].y) < 1e-4f;
    if (coincident || depth >= kMaxDepth) {
        nextPt[p] = cells[ci].point;       // chain coincident points
        cells[ci].point = p;
        return;
    }

    // Subdivide: push the existing point(s) down, then insert p.
    const int chain = cells[ci].point;
    cells[ci].internal = true;
    cells[ci].point = -1;
    for (int e = chain; e != -1; ) {
        const int nxt = nextPt[e];
        insertPoint(cells, nextPt, nodes, ci, x0, y0, cw, e, depth);
        e = nxt;
    }
    insertPoint(cells, nextPt, nodes, ci, x0, y0, cw, p, depth);
}

void computeMass(std::vector<Cell>& cells, const std::vector<int>& nextPt,
                 const QVector<PhysicsNode>& nodes, int ci, float perCharge)
{
    if (!cells[ci].internal) {
        float sx = 0.0f, sy = 0.0f;
        int cnt = 0;
        for (int p = cells[ci].point; p != -1; p = nextPt[p]) {
            sx += nodes[p].x; sy += nodes[p].y; ++cnt;
        }
        if (cnt > 0) {
            cells[ci].comX = sx / cnt;
            cells[ci].comY = sy / cnt;
            cells[ci].charge = perCharge * cnt;
        } else {
            cells[ci].charge = 0.0f;
        }
        return;
    }
    float wx = 0.0f, wy = 0.0f, q = 0.0f;
    for (int k = 0; k < 4; ++k) {
        const int ch = cells[ci].child[k];
        if (ch == -1) continue;
        computeMass(cells, nextPt, nodes, ch, perCharge);
        const float wabs = std::fabs(cells[ch].charge);
        wx += cells[ch].comX * wabs;
        wy += cells[ch].comY * wabs;
        q  += cells[ch].charge;
    }
    const float aw = std::fabs(q);
    if (aw > 0.0f) { cells[ci].comX = wx / aw; cells[ci].comY = wy / aw; }
    cells[ci].charge = q;
}

void applyForce(const std::vector<Cell>& cells, const std::vector<int>& nextPt,
                QVector<PhysicsNode>& nodes, int self, int ci,
                float x0, float y0, float cw, float perCharge)
{
    const Cell& c = cells[ci];
    if (c.charge == 0.0f) return;

    if (!c.internal) {
        for (int p = c.point; p != -1; p = nextPt[p]) {
            if (p == self) continue;
            float dx = nodes[p].x - nodes[self].x;
            float dy = nodes[p].y - nodes[self].y;
            float d2 = dx * dx + dy * dy;
            if (dx == 0.0f) { dx = jiggle(); d2 += dx * dx; }
            if (dy == 0.0f) { dy = jiggle(); d2 += dy * dy; }
            if (d2 < kDistMin2) d2 = std::sqrt(kDistMin2 * d2);
            const float f = perCharge / d2;
            nodes[self].fx += dx * f;
            nodes[self].fy += dy * f;
        }
        return;
    }

    float dx = c.comX - nodes[self].x;
    float dy = c.comY - nodes[self].y;
    float d2 = dx * dx + dy * dy;

    // Far enough → treat the whole cell as its centre of mass.
    if (cw * cw < kTheta2 * d2) {
        if (dx == 0.0f) { dx = jiggle(); d2 += dx * dx; }
        if (dy == 0.0f) { dy = jiggle(); d2 += dy * dy; }
        if (d2 < kDistMin2) d2 = std::sqrt(kDistMin2 * d2);
        const float f = c.charge / d2;
        nodes[self].fx += dx * f;
        nodes[self].fy += dy * f;
        return;
    }

    // Too close → recurse into children.
    const float half = cw * 0.5f;
    for (int k = 0; k < 4; ++k) {
        const int ch = c.child[k];
        if (ch == -1) continue;
        const float nx0 = x0 + ((k & 1) ? half : 0.0f);
        const float ny0 = y0 + ((k & 2) ? half : 0.0f);
        applyForce(cells, nextPt, nodes, self, ch, nx0, ny0, half, perCharge);
    }
}

} // namespace

void calculateRepulsion(QVector<PhysicsNode>& nodes, float repulsionStrength)
{
    const int n = nodes.size();
    if (n < 2) return;

    const float perCharge = -repulsionStrength;   // negative → repulsion; includes alpha

    // Bounding box → square root cell.
    float minX = nodes[0].x, maxX = nodes[0].x;
    float minY = nodes[0].y, maxY = nodes[0].y;
    for (int i = 1; i < n; ++i) {
        minX = std::min(minX, nodes[i].x);
        maxX = std::max(maxX, nodes[i].x);
        minY = std::min(minY, nodes[i].y);
        maxY = std::max(maxY, nodes[i].y);
    }
    float w = std::max(maxX - minX, maxY - minY);
    if (!(w > 0.0f)) w = 1.0f;
    w *= 1.01f;   // pad so points on the max edge fall inside

    // Reused across ticks (worker thread only) to avoid per-tick allocation.
    static thread_local std::vector<Cell> cells;
    static thread_local std::vector<int>  nextPt;
    cells.clear();
    cells.reserve(static_cast<size_t>(2 * n + 16));
    nextPt.assign(n, -1);
    cells.push_back(Cell{});   // root

    for (int p = 0; p < n; ++p)
        insertPoint(cells, nextPt, nodes, 0, minX, minY, w, p, 0);

    computeMass(cells, nextPt, nodes, 0, perCharge);

    for (int i = 0; i < n; ++i)
        applyForce(cells, nextPt, nodes, i, 0, minX, minY, w, perCharge);
}

} // namespace HyperLinkNotes::Core::Physics
