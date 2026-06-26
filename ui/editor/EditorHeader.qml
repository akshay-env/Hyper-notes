import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import HyperLinkNotes
import "../../scripts/navigation/goBack.js" as GoBack
import "../../scripts/navigation/goForward.js" as GoForward
import "../components"

Rectangle {
    id: root
    height: 40
    color: "transparent"
    
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 8
        anchors.rightMargin: 8
        spacing: 8
        
        // Breadcrumbs
        Text {
            id: breadcrumbText
            Layout.fillWidth: true
            color: Theme.textDim
            font.pixelSize: 13
            font.family: "Segoe UI"
            elide: Text.ElideLeft
            verticalAlignment: Text.AlignVCenter
            
            text: {
                if (!window.activeNote || !window.activeNote.path || !window.vaultFsRef.vaultPath) {
                    return "";
                }
                
                let fullPath = window.activeNote.path;
                let vaultRoot = window.vaultFsRef.vaultPath;
                
                if (fullPath.startsWith(vaultRoot)) {
                    let relPath = fullPath.substring(vaultRoot.length + 1);
                    let formatted = relPath.replace(/[\\/]/g, " / ");
                    return formatted.replace(/\.md$/i, "");
                }
                return fullPath;
            }
        }

        // Navigation Arrows
        Row {
            spacing: 2
            
            IconButton {
                iconText: "←"
                iconSize: 26
                iconBold: true
                implicitWidth: 36
                implicitHeight: 36
                tooltipText: "Back"
                opacity: window.historyIndex > 0 ? 1.0 : 0.25
                enabled: window.historyIndex > 0
                onClicked: GoBack.goBack(window)
            }
            
            IconButton {
                iconText: "→"
                iconSize: 26
                iconBold: true
                implicitWidth: 36
                implicitHeight: 36
                tooltipText: "Forward"
                opacity: window.historyIndex >= 0 && window.historyIndex < window.historyStack.length - 1 ? 1.0 : 0.25
                enabled: window.historyIndex >= 0 && window.historyIndex < window.historyStack.length - 1
                onClicked: GoForward.goForward(window)
            }
        }

        // Separator
        Rectangle {
            width: 1
            height: 20
            color: Theme.border
        }

        // Graph View toggle button
        IconButton {
            implicitWidth: 36
            implicitHeight: 36
            tooltipText: window.graphViewActive ? "Close Graph View" : "Graph View"
            opacity: window.graphViewActive ? 1.0 : 0.7
            defaultColor: window.graphViewActive ? Theme.accentSoft : "transparent"
            onClicked: {
                window.graphViewActive = !window.graphViewActive;
            }

            // Mini knowledge-graph glyph: a hub node linked to three satellites
            Canvas {
                anchors.centerIn: parent
                width: 22
                height: 22
                property color tint: window.graphViewActive ? Theme.accentText : Theme.textDim
                onTintChanged: requestPaint()
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.reset();
                    ctx.strokeStyle = tint;
                    ctx.fillStyle = tint;
                    ctx.lineWidth = 1.4;

                    var nodes = [[11, 12], [11, 3], [4, 18], [18, 18]];
                    var radii = [3.2, 2.4, 2.4, 2.4];

                    ctx.beginPath();
                    for (var i = 1; i < nodes.length; i++) {
                        ctx.moveTo(nodes[0][0], nodes[0][1]);
                        ctx.lineTo(nodes[i][0], nodes[i][1]);
                    }
                    ctx.stroke();

                    for (var j = 0; j < nodes.length; j++) {
                        ctx.beginPath();
                        ctx.arc(nodes[j][0], nodes[j][1], radii[j], 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }
    }
}
