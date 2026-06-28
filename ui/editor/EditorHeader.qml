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

            // Graph glyph: three interconnected nodes, drawn as OUTLINED circles +
            // connecting edges to match the app's other line icons (trash/folder/gear).
            Canvas {
                anchors.centerIn: parent
                width: 22
                height: 22
                property color tint: window.graphViewActive ? Theme.accentText : Theme.textDim
                onTintChanged: requestPaint()
                onPaint: {
                    var ctx = getContext("2d");
                    ctx.reset();
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";
                    ctx.strokeStyle = tint;
                    ctx.lineWidth = 1.3;

                    var n = [[11, 4.6], [5.2, 16.4], [16.8, 16.4]];
                    var r = 2.7;
                    var edges = [[0, 1], [1, 2], [2, 0]];

                    // Edges connect the circle perimeters (not centres) for a clean look.
                    for (var e = 0; e < edges.length; e++) {
                        var a = n[edges[e][0]], b = n[edges[e][1]];
                        var dx = b[0] - a[0], dy = b[1] - a[1];
                        var d = Math.sqrt(dx * dx + dy * dy);
                        var ux = dx / d, uy = dy / d;
                        ctx.beginPath();
                        ctx.moveTo(a[0] + ux * r, a[1] + uy * r);
                        ctx.lineTo(b[0] - ux * r, b[1] - uy * r);
                        ctx.stroke();
                    }

                    // Hollow nodes on top.
                    for (var i = 0; i < n.length; i++) {
                        ctx.beginPath();
                        ctx.arc(n[i][0], n[i][1], r, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
            }
        }
    }
}
