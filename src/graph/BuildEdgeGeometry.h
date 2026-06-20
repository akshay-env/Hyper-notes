#pragma once
#include <QSGGeometry>
#include <QVector>
#include "src/physics/PhysicsTypes.h"

namespace HyperLinkNotes::Core {

// Fills `geometry` with the edges to draw, transformed by pan/zoom.
// highlightIndex: index of the hovered node, or -1 for none.
// wantTouching:  true  -> only edges connected to highlightIndex (the bright pass)
//                false -> only edges NOT connected (or all edges when highlightIndex < 0)
void buildEdgeGeometry(QSGGeometry* geometry,
                       const QVector<Physics::PhysicsNode>& nodes,
                       const QVector<Physics::PhysicsEdge>& edges,
                       float panX, float panY, float zoomFactor,
                       int highlightIndex, bool wantTouching);

} // namespace HyperLinkNotes::Core
