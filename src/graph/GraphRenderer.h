#pragma once
#include <QQuickItem>
#include <QSGGeometryNode>
#include <QSGFlatColorMaterial>
#include "ForceSimulation.h"

namespace HyperLinkNotes::Core {

class GraphRenderer : public QQuickItem {
    Q_OBJECT
    QML_ELEMENT

    Q_PROPERTY(HyperLinkNotes::Core::ForceSimulation* simulation READ simulation WRITE setSimulation NOTIFY simulationChanged)
    Q_PROPERTY(float panX READ panX WRITE setPanX NOTIFY panXChanged)
    Q_PROPERTY(float panY READ panY WRITE setPanY NOTIFY panYChanged)
    Q_PROPERTY(float zoomFactor READ zoomFactor WRITE setZoomFactor NOTIFY zoomFactorChanged)
    Q_PROPERTY(QString highlightNodeId READ highlightNodeId WRITE setHighlightNodeId NOTIFY highlightNodeIdChanged)

public:
    explicit GraphRenderer(QQuickItem *parent = nullptr);

    ForceSimulation* simulation() const;
    void setSimulation(ForceSimulation* simulation);

    float panX() const;
    void setPanX(float panX);

    float panY() const;
    void setPanY(float panY);

    float zoomFactor() const;
    void setZoomFactor(float zoomFactor);

    QString highlightNodeId() const;
    void setHighlightNodeId(const QString& id);

protected:
    QSGNode *updatePaintNode(QSGNode *oldNode, UpdatePaintNodeData *updatePaintNodeData) override;

signals:
    void simulationChanged();
    void panXChanged();
    void panYChanged();
    void zoomFactorChanged();
    void highlightNodeIdChanged();

private:
    ForceSimulation* m_simulation = nullptr;
    float m_panX = 0.0f;
    float m_panY = 0.0f;
    float m_zoomFactor = 1.0f;
    QString m_highlightNodeId;
};

} // namespace HyperLinkNotes::Core
