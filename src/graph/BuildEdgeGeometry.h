#pragma once
#include <QSGGeometry>
#include <QVector>
#include <QSet>
#include "src/physics/PhysicsTypes.h"

namespace HyperLinkNotes::Core {

// Fills `geometry` with the edges to draw, transformed by pan/zoom.
// highlightIndices: indices of the focused nodes (open tabs ∪ hovered), empty for none.
// wantTouching:  true  -> only edges connected to a focused node (the bright pass)
//                false -> only edges NOT connected (or all edges when the set is empty)
void buildEdgeGeometry(QSGGeometry* geometry,
                       const QVector<Physics::PhysicsNode>& nodes,
                       const QVector<Physics::PhysicsEdge>& edges,
                       float panX, float panY, float zoomFactor,
                       const QSet<int>& highlightIndices, bool wantTouching);

} // namespace HyperLinkNotes::Core
