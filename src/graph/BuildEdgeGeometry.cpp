#include "BuildEdgeGeometry.h"

namespace HyperLinkNotes::Core {

void buildEdgeGeometry(QSGGeometry* geometry,
                       const QVector<Physics::PhysicsNode>& nodes,
                       const QVector<Physics::PhysicsEdge>& edges,
                       float panX, float panY, float zoomFactor,
                       int highlightIndex, bool wantTouching)
{
    const int nodeCount = nodes.size();

    auto edgeValid = [&](const Physics::PhysicsEdge& e) {
        return e.sourceIndex >= 0 && e.sourceIndex < nodeCount &&
               e.targetIndex >= 0 && e.targetIndex < nodeCount;
    };
    auto edgeWanted = [&](const Physics::PhysicsEdge& e) {
        const bool touches = (highlightIndex >= 0 &&
                              (e.sourceIndex == highlightIndex || e.targetIndex == highlightIndex));
        return wantTouching ? touches : !touches;
    };

    // First pass: count how many edges belong to this layer
    int count = 0;
    for (const auto& e : edges) {
        if (edgeValid(e) && edgeWanted(e))
            ++count;
    }

    geometry->allocate(count * 2);
    if (count == 0)
        return;

    QSGGeometry::Point2D* v = geometry->vertexDataAsPoint2D();
    int k = 0;
    for (const auto& e : edges) {
        if (!edgeValid(e) || !edgeWanted(e))
            continue;

        const auto& s = nodes[e.sourceIndex];
        const auto& t = nodes[e.targetIndex];

        v[k * 2].set    (s.x * zoomFactor + panX, s.y * zoomFactor + panY);
        v[k * 2 + 1].set(t.x * zoomFactor + panX, t.y * zoomFactor + panY);
        ++k;
    }
}

} // namespace HyperLinkNotes::Core
