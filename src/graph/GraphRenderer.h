#pragma once
#include <QQuickItem>
#include <QSGGeometryNode>
#include <QSGFlatColorMaterial>
#include <QStringList>
#include <QColor>
#include "ForceSimulation.h"

namespace HyperLinkNotes::Core {

class GraphRenderer : public QQuickItem {
    Q_OBJECT
    QML_ELEMENT

    Q_PROPERTY(HyperLinkNotes::Core::ForceSimulation* simulation READ simulation WRITE setSimulation NOTIFY simulationChanged)
    Q_PROPERTY(float panX READ panX WRITE setPanX NOTIFY panXChanged)
    Q_PROPERTY(float panY READ panY WRITE setPanY NOTIFY panYChanged)
    Q_PROPERTY(float zoomFactor READ zoomFactor WRITE setZoomFactor NOTIFY zoomFactorChanged)
    // Set of node ids whose incident edges light up (open tabs ∪ hovered node).
    Q_PROPERTY(QStringList highlightNodeIds READ highlightNodeIds WRITE setHighlightNodeIds NOTIFY highlightNodeIdsChanged)
    // Theme-driven edge colours.
    Q_PROPERTY(QColor edgeColor READ edgeColor WRITE setEdgeColor NOTIFY edgeColorChanged)
    Q_PROPERTY(QColor accentColor READ accentColor WRITE setAccentColor NOTIFY accentColorChanged)

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

    QStringList highlightNodeIds() const;
    void setHighlightNodeIds(const QStringList& ids);

    QColor edgeColor() const { return m_edgeColor; }
    void setEdgeColor(const QColor& c);

    QColor accentColor() const { return m_accentColor; }
    void setAccentColor(const QColor& c);

protected:
    QSGNode *updatePaintNode(QSGNode *oldNode, UpdatePaintNodeData *updatePaintNodeData) override;

signals:
    void simulationChanged();
    void panXChanged();
    void panYChanged();
    void zoomFactorChanged();
    void highlightNodeIdsChanged();
    void edgeColorChanged();
    void accentColorChanged();

private:
    ForceSimulation* m_simulation = nullptr;
    float m_panX = 0.0f;
    float m_panY = 0.0f;
    float m_zoomFactor = 1.0f;
    QStringList m_highlightNodeIds;
    QColor m_edgeColor   = QColor(58, 62, 74, 170);
    QColor m_accentColor = QColor(255, 210, 63, 240);
};

} // namespace HyperLinkNotes::Core
