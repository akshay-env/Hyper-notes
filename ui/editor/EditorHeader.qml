import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
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
            color: "#888888"
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
            color: "#2c2c2c"
        }

        // Graph View toggle button
        IconButton {
            implicitWidth: 36
            implicitHeight: 36
            tooltipText: window.graphViewActive ? "Close Graph View" : "Graph View"
            iconText: "⚯"
            iconSize: 18
            opacity: window.graphViewActive ? 1.0 : 0.7
            defaultColor: window.graphViewActive ? Qt.rgba(0.3, 0.4, 0.8, 0.25) : "transparent"
            onClicked: {
                window.graphViewActive = !window.graphViewActive;
            }
        }
    }
}
