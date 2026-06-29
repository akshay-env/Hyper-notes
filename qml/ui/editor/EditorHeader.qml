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

        // Find-in-note toggle — opens the slide-down search bar.
        IconButton {
            implicitWidth: 36
            implicitHeight: 36
            tooltipText: "Find in note"
            enabled: window.activeNote !== null
            opacity: window.activeNote === null ? 0.25 : (window.noteSearchOpen ? 1.0 : 0.7)
            defaultColor: window.noteSearchOpen ? Theme.accentSoft : "transparent"
            onClicked: window.noteSearchOpen = !window.noteSearchOpen

            Canvas {
                anchors.centerIn: parent
                width: 20
                height: 20
                property color tint: window.noteSearchOpen ? Theme.accentText : Theme.textDim
                onTintChanged: requestPaint()
                onPaint: {
                    var c = getContext("2d");
                    c.reset();
                    c.strokeStyle = tint;
                    c.lineWidth = 1.6;
                    c.lineCap = "round";
                    c.beginPath();
                    c.arc(8.4, 8.4, 5, 0, Math.PI * 2);   // lens
                    c.stroke();
                    c.beginPath();
                    c.moveTo(12.1, 12.1); c.lineTo(16.6, 16.6);   // handle
                    c.stroke();
                }
            }
        }

        // Right-panel (Graph + Outline) collapse toggle — the right column is FILLED
        // when the panel is open and just an OUTLINE when collapsed (same filled/empty
        // idea as the sidebar toggle, animated, with no accent glow).
        IconButton {
            id: panelBtn
            implicitWidth: 36
            implicitHeight: 36
            tooltipText: window.rightPanelOpen ? "Hide side panel" : "Show side panel"
            onClicked: window.rightPanelOpen = !window.rightPanelOpen

            Item {
                id: panelGlyph
                anchors.centerIn: parent
                width: 20
                height: 20
                property color tint: panelBtn.containsMouse ? Theme.text : Theme.textDim

                // Frame + right-column divider (outline, always shown).
                Canvas {
                    anchors.fill: parent
                    property color tint: panelGlyph.tint
                    onTintChanged: requestPaint()
                    onPaint: {
                        var c = getContext("2d");
                        c.reset();
                        c.strokeStyle = tint;
                        c.lineWidth = 1.4;
                        c.lineJoin = "round";
                        c.beginPath(); c.rect(2.5, 3.5, 15, 13); c.stroke();          // frame
                        c.beginPath(); c.moveTo(12.5, 3.5); c.lineTo(12.5, 16.5); c.stroke();  // divider
                    }
                }

                // Filled right column — visible only while the panel is open (animated).
                Rectangle {
                    x: 12.5; y: 3.5
                    width: 5; height: 13
                    color: panelGlyph.tint
                    opacity: window.rightPanelOpen ? 1.0 : 0.0
                    Behavior on opacity { NumberAnimation { duration: 200; easing.type: Easing.InOutQuad } }
                }
            }
        }
    }
}
