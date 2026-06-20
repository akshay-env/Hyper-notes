#include "GraphRenderer.h"
#include "BuildEdgeGeometry.h"

namespace HyperLinkNotes::Core {

GraphRenderer::GraphRenderer(QQuickItem *parent) : QQuickItem(parent)
{
    setFlag(ItemHasContents, true);
}

ForceSimulation* GraphRenderer::simulation() const
{
    return m_simulation;
}

void GraphRenderer::setSimulation(ForceSimulation* simulation)
{
    if (m_simulation == simulation)
        return;

    if (m_simulation) {
        disconnect(m_simulation, &ForceSimulation::positionsUpdated, this, &QQuickItem::update);
    }

    m_simulation = simulation;

    if (m_simulation) {
        connect(m_simulation, &ForceSimulation::positionsUpdated, this, &QQuickItem::update);
    }

    emit simulationChanged();
    update();
}

float GraphRenderer::panX() const { return m_panX; }
void GraphRenderer::setPanX(float panX) {
    if (qFuzzyCompare(m_panX, panX)) return;
    m_panX = panX;
    emit panXChanged();
    update();
}

float GraphRenderer::panY() const { return m_panY; }
void GraphRenderer::setPanY(float panY) {
    if (qFuzzyCompare(m_panY, panY)) return;
    m_panY = panY;
    emit panYChanged();
    update();
}

float GraphRenderer::zoomFactor() const { return m_zoomFactor; }
void GraphRenderer::setZoomFactor(float zoomFactor) {
    if (qFuzzyCompare(m_zoomFactor, zoomFactor)) return;
    m_zoomFactor = zoomFactor;
    emit zoomFactorChanged();
    update();
}

QString GraphRenderer::highlightNodeId() const { return m_highlightNodeId; }
void GraphRenderer::setHighlightNodeId(const QString& id) {
    if (m_highlightNodeId == id) return;
    m_highlightNodeId = id;
    emit highlightNodeIdChanged();
    update();
}

QSGNode *GraphRenderer::updatePaintNode(QSGNode *oldNode, UpdatePaintNodeData *)
{
    QSGNode *root = oldNode;
    QSGGeometryNode *dimNode = nullptr;   // edges away from the hovered node
    QSGGeometryNode *hiNode  = nullptr;   // edges touching the hovered node

    if (!root) {
        root = new QSGNode;

        // Layer 1 — dim base edges
        dimNode = new QSGGeometryNode;
        QSGGeometry *dimGeo = new QSGGeometry(QSGGeometry::defaultAttributes_Point2D(), 0);
        dimGeo->setDrawingMode(QSGGeometry::DrawLines);
        dimGeo->setLineWidth(1);
        dimNode->setGeometry(dimGeo);
        dimNode->setFlag(QSGNode::OwnsGeometry);
        QSGFlatColorMaterial *dimMat = new QSGFlatColorMaterial;
        dimMat->setColor(QColor(63, 63, 63, 160)); // Obsidian --graph-line: #3f3f3f
        dimNode->setMaterial(dimMat);
        dimNode->setFlag(QSGNode::OwnsMaterial);
        root->appendChildNode(dimNode);

        // Layer 2 — highlighted edges (drawn on top, brighter + thicker)
        hiNode = new QSGGeometryNode;
        QSGGeometry *hiGeo = new QSGGeometry(QSGGeometry::defaultAttributes_Point2D(), 0);
        hiGeo->setDrawingMode(QSGGeometry::DrawLines);
        hiGeo->setLineWidth(2);
        hiNode->setGeometry(hiGeo);
        hiNode->setFlag(QSGNode::OwnsGeometry);
        QSGFlatColorMaterial *hiMat = new QSGFlatColorMaterial;
        hiMat->setColor(QColor(168, 130, 255, 235)); // Obsidian accent #a882ff
        hiNode->setMaterial(hiMat);
        hiNode->setFlag(QSGNode::OwnsMaterial);
        root->appendChildNode(hiNode);
    } else {
        dimNode = static_cast<QSGGeometryNode *>(root->childAtIndex(0));
        hiNode  = static_cast<QSGGeometryNode *>(root->childAtIndex(1));
    }

    if (m_simulation) {
        const int hi = m_simulation->indexForId(m_highlightNodeId); // -1 when nothing hovered
        buildEdgeGeometry(dimNode->geometry(), m_simulation->nodes(), m_simulation->edges(),
                          m_panX, m_panY, m_zoomFactor, hi, /*wantTouching*/ false);
        buildEdgeGeometry(hiNode->geometry(),  m_simulation->nodes(), m_simulation->edges(),
                          m_panX, m_panY, m_zoomFactor, hi, /*wantTouching*/ true);
    } else {
        dimNode->geometry()->allocate(0);
        hiNode->geometry()->allocate(0);
    }

    dimNode->markDirty(QSGNode::DirtyGeometry);
    hiNode->markDirty(QSGNode::DirtyGeometry);
    return root;
}

} // namespace HyperLinkNotes::Core
