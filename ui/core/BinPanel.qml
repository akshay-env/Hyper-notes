import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import HyperLinkNotes
import "../../scripts/bin/refreshBinList.js" as RefreshBinList

// In-app recycle bin. A centered modal card over a dimmed backdrop — lives
// inside the main window (no separate OS window). Driven by window.binOpen.
Item {
    id: binPanel
    anchors.fill: parent
    visible: window.binOpen
    z: 200

    property var vaultFs: null

    // Inline confirmation state: "none" | "one" | "empty".
    property string confirmMode: "none"
    property string confirmPath: ""

    ListModel { id: binModel }

    function refresh() {
        if (vaultFs) RefreshBinList.refreshBinList(vaultFs, binModel);
    }
    function close() {
        confirmMode = "none";
        window.binOpen = false;
    }
    onVisibleChanged: if (visible) refresh()

    // ── Dimmed backdrop (click outside the card to dismiss) ──────────────────
    Rectangle {
        anchors.fill: parent
        color: "#000000"
        opacity: 0.5
        MouseArea {
            anchors.fill: parent
            onClicked: binPanel.close()
        }
    }

    // ── Centered card ────────────────────────────────────────────────────────
    Rectangle {
        id: card
        anchors.centerIn: parent
        width: Math.min(580, parent.width - 80)
        height: Math.min(500, parent.height - 80)
        color: Theme.surface
        border.color: Theme.border
        border.width: 1
        radius: 12

        // Swallow clicks so they don't fall through to the backdrop.
        MouseArea { anchors.fill: parent }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 18
            spacing: 14

            // Header
            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                Canvas {
                    width: 16
                    height: 16
                    Layout.alignment: Qt.AlignVCenter
                    onPaint: {
                        var ctx = getContext("2d");
                        ctx.reset();
                        ctx.strokeStyle = Theme.text;
                        ctx.lineWidth = 1.4;
                        ctx.lineJoin = "round";
                        ctx.beginPath();
                        ctx.moveTo(2.5, 4); ctx.lineTo(13.5, 4);
                        ctx.moveTo(6.5, 4); ctx.lineTo(6.5, 2.3); ctx.lineTo(9.5, 2.3); ctx.lineTo(9.5, 4);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(3.4, 4); ctx.lineTo(4.3, 14); ctx.lineTo(11.7, 14); ctx.lineTo(12.6, 4);
                        ctx.stroke();
                    }
                }

                Text {
                    text: "Bin"
                    color: Theme.text
                    font.pixelSize: 16
                    font.bold: true
                    font.family: "Segoe UI"
                }

                Text {
                    text: binModel.count + (binModel.count === 1 ? " item" : " items")
                    color: Theme.textMuted
                    font.pixelSize: 11
                    Layout.alignment: Qt.AlignVCenter
                }

                Item { Layout.fillWidth: true }

                // Empty bin (ghost danger)
                Rectangle {
                    visible: binModel.count > 0
                    width: emptyTxt.implicitWidth + 22
                    height: 28
                    radius: 6
                    color: emptyHover.containsMouse ? Theme.dangerSoft : "transparent"
                    border.color: Qt.rgba(0.94, 0.37, 0.42, 0.4)
                    border.width: 1
                    Behavior on color { ColorAnimation { duration: Theme.animFast } }

                    Text {
                        id: emptyTxt
                        anchors.centerIn: parent
                        text: "Empty bin"
                        color: Theme.danger
                        font.pixelSize: 12
                        font.bold: true
                        font.family: "Segoe UI"
                    }

                    MouseArea {
                        id: emptyHover
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: { binPanel.confirmPath = ""; binPanel.confirmMode = "empty"; }
                    }
                }

                // Close
                Rectangle {
                    width: 28
                    height: 28
                    radius: 6
                    color: closeHover.containsMouse ? Theme.elevated : "transparent"
                    Behavior on color { ColorAnimation { duration: Theme.animFast } }

                    Text {
                        anchors.centerIn: parent
                        text: "✕"
                        color: Theme.textDim
                        font.pixelSize: 13
                    }

                    MouseArea {
                        id: closeHover
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: binPanel.close()
                    }
                }
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.divider }

            // List
            ScrollView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                ScrollBar.horizontal.policy: ScrollBar.AlwaysOff

                ListView {
                    id: binListView
                    model: binModel
                    spacing: 4

                    delegate: Rectangle {
                        width: binListView.width
                        height: 40
                        radius: 6
                        color: rowHover.containsMouse ? Theme.surface2 : "transparent"
                        Behavior on color { ColorAnimation { duration: Theme.animFast } }

                        MouseArea {
                            id: rowHover
                            anchors.fill: parent
                            hoverEnabled: true
                        }

                        RowLayout {
                            anchors.fill: parent
                            anchors.leftMargin: 12 + (model.depth * 14)
                            anchors.rightMargin: 10
                            spacing: 10

                            Text {
                                text: (model.isFolder ? "▸ " : "") + model.name
                                color: model.isFolder ? Theme.text : Theme.textDim
                                font.pixelSize: 13
                                font.family: "Segoe UI"
                                elide: Text.ElideRight
                                Layout.maximumWidth: 220
                            }

                            Text {
                                Layout.fillWidth: true
                                horizontalAlignment: Text.AlignRight
                                text: model.originalPath !== ""
                                      ? "← " + model.originalPath
                                              .replace(vaultFs ? vaultFs.vaultPath : "", "")
                                              .replace(/\\/g, "/")
                                      : ""
                                color: Theme.textFaint
                                font.pixelSize: 10
                                font.family: "Segoe UI"
                                elide: Text.ElideLeft
                            }

                            // Restore (gold pill)
                            Rectangle {
                                width: restoreTxt.implicitWidth + 20
                                height: 24
                                radius: 5
                                color: restoreHover.containsMouse ? Theme.accentHover : Theme.accent
                                Behavior on color { ColorAnimation { duration: Theme.animFast } }

                                Text {
                                    id: restoreTxt
                                    anchors.centerIn: parent
                                    text: "Restore"
                                    color: Theme.onAccent
                                    font.pixelSize: 11
                                    font.bold: true
                                    font.family: "Segoe UI"
                                }

                                MouseArea {
                                    id: restoreHover
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    onClicked: {
                                        if (vaultFs && vaultFs.restoreFromBin(model.path))
                                            binPanel.refresh();
                                    }
                                }
                            }

                            // Delete forever (danger ghost pill)
                            Rectangle {
                                width: delTxt.implicitWidth + 18
                                height: 24
                                radius: 5
                                color: delHover.containsMouse ? Theme.dangerSoft : "transparent"
                                border.color: Qt.rgba(0.94, 0.37, 0.42, 0.45)
                                border.width: 1
                                Behavior on color { ColorAnimation { duration: Theme.animFast } }

                                Text {
                                    id: delTxt
                                    anchors.centerIn: parent
                                    text: "Delete"
                                    color: Theme.danger
                                    font.pixelSize: 11
                                    font.bold: true
                                    font.family: "Segoe UI"
                                }

                                MouseArea {
                                    id: delHover
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    onClicked: {
                                        binPanel.confirmPath = model.path;
                                        binPanel.confirmMode = "one";
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Empty state
        Text {
            anchors.centerIn: parent
            visible: binModel.count === 0
            text: "Bin is empty"
            color: Theme.textMuted
            font.pixelSize: 14
            font.family: "Segoe UI"
        }

        // ── Inline confirmation (covers the card) ────────────────────────────
        Rectangle {
            anchors.fill: parent
            radius: 12
            visible: binPanel.confirmMode !== "none"
            color: Qt.rgba(0, 0, 0, 0.62)

            MouseArea { anchors.fill: parent }

            Rectangle {
                anchors.centerIn: parent
                width: 320
                implicitHeight: confirmCol.implicitHeight + 36
                height: implicitHeight
                color: Theme.surface2
                border.color: Theme.border
                border.width: 1
                radius: 10

                ColumnLayout {
                    id: confirmCol
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.margins: 18
                    spacing: 16

                    Text {
                        Layout.fillWidth: true
                        text: binPanel.confirmMode === "empty"
                              ? "Permanently delete everything in the bin? This cannot be undone."
                              : "Permanently delete this item? This cannot be undone."
                        color: Theme.textDim
                        font.pixelSize: 13
                        font.family: "Segoe UI"
                        wrapMode: Text.WordWrap
                    }

                    RowLayout {
                        Layout.alignment: Qt.AlignRight
                        spacing: 10

                        Rectangle {
                            width: 86; height: 32; radius: 6
                            color: cancelHover.containsMouse ? Theme.elevated : "transparent"
                            border.color: Theme.border
                            border.width: 1
                            Behavior on color { ColorAnimation { duration: Theme.animFast } }

                            Text {
                                anchors.centerIn: parent
                                text: "Cancel"
                                color: Theme.textDim
                                font.pixelSize: 13
                                font.family: "Segoe UI"
                            }

                            MouseArea {
                                id: cancelHover
                                anchors.fill: parent
                                hoverEnabled: true
                                onClicked: binPanel.confirmMode = "none"
                            }
                        }

                        Rectangle {
                            width: confDelTxt.implicitWidth + 26; height: 32; radius: 6
                            color: confDelHover.containsMouse ? Theme.dangerHover : Theme.danger
                            Behavior on color { ColorAnimation { duration: Theme.animFast } }

                            Text {
                                id: confDelTxt
                                anchors.centerIn: parent
                                text: binPanel.confirmMode === "empty" ? "Empty bin" : "Delete forever"
                                color: "#ffffff"
                                font.pixelSize: 13
                                font.bold: true
                                font.family: "Segoe UI"
                            }

                            MouseArea {
                                id: confDelHover
                                anchors.fill: parent
                                hoverEnabled: true
                                onClicked: {
                                    if (vaultFs) {
                                        if (binPanel.confirmMode === "empty") {
                                            let items = vaultFs.getBinTree();
                                            for (let i = 0; i < items.length; i++)
                                                vaultFs.deleteFromBinPermanently(items[i].path);
                                        } else {
                                            vaultFs.deleteFromBinPermanently(binPanel.confirmPath);
                                        }
                                        binPanel.refresh();
                                    }
                                    binPanel.confirmMode = "none";
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Esc closes (confirm first, then the panel).
    Keys.onEscapePressed: {
        if (confirmMode !== "none") confirmMode = "none";
        else close();
    }
    focus: visible
}
