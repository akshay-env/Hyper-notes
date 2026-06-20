import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window
import QtQuick.Window
import HyperLinkNotes
import "../../scripts/bin/refreshBinList.js" as RefreshBinList
ApplicationWindow {
    id: binWindow
    title: "Bin"
    width: 600
    height: 500
    color: "#121212"
    flags: Qt.Window

    property var vaultFs: null

    onVisibilityChanged: {
        if (visible) RefreshBinList.refreshBinList(vaultFs, binModel);
    }


    ListModel { id: binModel }

    Rectangle {
        anchors.fill: parent
        color: "#121212"

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 24
            spacing: 16

            // Header
            RowLayout {
                Layout.fillWidth: true

                Text {
                    text: "🗑  Bin"
                    color: "#ffffff"
                    font.pixelSize: 22
                    font.bold: true
                }

                Item { Layout.fillWidth: true }

                // Empty Bin button
                Rectangle {
                    width: 110
                    height: 30
                    color: emptyHover.containsMouse ? Qt.rgba(1,0,0,0.15) : Qt.rgba(1,0,0,0.07)
                    radius: 4
                    border.color: Qt.rgba(1,0,0,0.4)
                    border.width: 1

                    Text {
                        anchors.centerIn: parent
                        text: "Empty Bin"
                        color: "#ff5555"
                        font.pixelSize: 12
                        font.bold: true
                    }

                    MouseArea {
                        id: emptyHover
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: emptyBinConfirmDialog.open()
                    }
                }
            }

            // Divider
            Rectangle { Layout.fillWidth: true; height: 1; color: "#222222" }

            // Bin items list
            ScrollView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true

                ListView {
                    id: binListView
                    model: binModel
                    spacing: 2

                    delegate: Rectangle {
                        width: binListView.width
                        height: 36
                        color: itemHover.containsMouse ? Qt.rgba(1,1,1,0.05) : "transparent"
                        radius: 4

                        Row {
                            anchors.fill: parent
                            anchors.leftMargin: 8 + (model.depth * 16)
                            spacing: 8

                            Text {
                                width: 18
                                anchors.verticalCenter: parent.verticalCenter
                                text: model.isFolder ? "▶" : ""
                                color: "#555555"
                                font.pixelSize: 10
                            }

                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                text: model.name
                                color: model.isFolder ? "#dddddd" : "#bbbbbb"
                                font.pixelSize: 13
                                font.family: "Segoe UI"
                            }
                        }

                        // Original path hint on right
                        Text {
                            anchors.right: restoreBtn.left
                            anchors.rightMargin: 12
                            anchors.verticalCenter: parent.verticalCenter
                            text: model.originalPath !== "" ? "← " + model.originalPath.replace(vaultFs ? vaultFs.vaultPath : "", "").replace(/\\/g, "/") : ""
                            color: "#444444"
                            font.pixelSize: 10
                            font.family: "Segoe UI"
                            elide: Text.ElideLeft
                            width: Math.min(implicitWidth, 200)
                        }

                        // Restore button
                        Rectangle {
                            id: restoreBtn
                            anchors.right: permDeleteBtn.left
                            anchors.rightMargin: 6
                            anchors.verticalCenter: parent.verticalCenter
                            width: 68
                            height: 24
                            color: restoreHover.containsMouse ? "#1a4a1a" : "#0f2a0f"
                            radius: 4
                            border.color: "#2a7a2a"
                            border.width: 1

                            Text {
                                anchors.centerIn: parent
                                text: "↩ Restore"
                                color: "#44cc44"
                                font.pixelSize: 11
                                font.bold: true
                            }

                            MouseArea {
                                id: restoreHover
                                hoverEnabled: true
                                onClicked: {
                                    if (vaultFs && vaultFs.restoreFromBin(model.path)) {
                                        RefreshBinList.refreshBinList(vaultFs, binModel);
                                    }
                                }
                            }
                        }

                        // Permanent delete button
                        Rectangle {
                            id: permDeleteBtn
                            anchors.right: parent.right
                            anchors.rightMargin: 8
                            anchors.verticalCenter: parent.verticalCenter
                            width: 24
                            height: 24
                            color: permDelHover.containsMouse ? Qt.rgba(1,0,0,0.15) : "transparent"
                            radius: 4

                            Text {
                                anchors.centerIn: parent
                                text: "✕"
                                color: "#ff4444"
                                font.pixelSize: 13
                                font.bold: true
                            }

                            MouseArea {
                                id: permDelHover
                                anchors.fill: parent
                                hoverEnabled: true
                                onClicked: {
                                    permDeleteConfirmPath = model.path;
                                    permDeleteConfirmDialog.open();
                                }
                            }
                        }

                        MouseArea {
                            id: itemHover
                            anchors.fill: parent
                            hoverEnabled: true
                            // Don't block buttons
                            onClicked: {}
                        }
                    }
                }
            }

            // Empty state
            Text {
                Layout.alignment: Qt.AlignHCenter
                visible: binModel.count === 0
                text: "Bin is empty"
                color: "#444444"
                font.pixelSize: 14
                font.family: "Segoe UI"
            }
        }
    }

    // Permanent delete path tracker
    property string permDeleteConfirmPath: ""

    // Confirm permanent delete
    Dialog {
        id: permDeleteConfirmDialog
        title: "Delete Forever?"
        modal: true
        anchors.centerIn: parent
        background: Rectangle { color: "#1a1a1a"; radius: 8; border.color: "#333" }

        contentItem: Column {
            spacing: 12
            padding: 16

            Text {
                text: "This action cannot be undone.\nThe item will be permanently deleted."
                color: "#cccccc"
                font.pixelSize: 13
            }

            Row {
                spacing: 10
                anchors.right: parent.right

                Rectangle {
                    width: 80; height: 28
                    color: "#2a2a2a"; radius: 4
                    Text { anchors.centerIn: parent; text: "Cancel"; color: "#ffffff"; font.pixelSize: 12 }
                    MouseArea { anchors.fill: parent; onClicked: permDeleteConfirmDialog.close() }
                }
                Rectangle {
                    width: 100; height: 28
                    color: "#8b0000"; radius: 4
                    Text { anchors.centerIn: parent; text: "Delete Forever"; color: "#ffffff"; font.pixelSize: 12; font.bold: true }
                    MouseArea {
                        anchors.fill: parent
                        onClicked: {
                            permDeleteConfirmDialog.close();
                            if (vaultFs) {
                                vaultFs.deleteFromBinPermanently(binWindow.permDeleteConfirmPath);
                                RefreshBinList.refreshBinList(vaultFs, binModel);
                            }
                        }
                    }
                }
            }
        }
    }

    // Confirm empty bin
    Dialog {
        id: emptyBinConfirmDialog
        title: "Empty Bin?"
        modal: true
        anchors.centerIn: parent
        background: Rectangle { color: "#1a1a1a"; radius: 8; border.color: "#333" }

        contentItem: Column {
            spacing: 12
            padding: 16

            Text {
                text: "This will permanently delete all items in the bin.\nThis cannot be undone."
                color: "#cccccc"
                font.pixelSize: 13
            }

            Row {
                spacing: 10
                anchors.right: parent.right

                Rectangle {
                    width: 80; height: 28
                    color: "#2a2a2a"; radius: 4
                    Text { anchors.centerIn: parent; text: "Cancel"; color: "#ffffff"; font.pixelSize: 12 }
                    MouseArea { anchors.fill: parent; onClicked: emptyBinConfirmDialog.close() }
                }
                Rectangle {
                    width: 90; height: 28
                    color: "#8b0000"; radius: 4
                    Text { anchors.centerIn: parent; text: "Empty Bin"; color: "#ffffff"; font.pixelSize: 12; font.bold: true }
                    MouseArea {
                        anchors.fill: parent
                        onClicked: {
                            emptyBinConfirmDialog.close();
                            if (vaultFs) {
                                let items = vaultFs.getBinTree();
                                for (let i = 0; i < items.length; i++) {
                                    vaultFs.deleteFromBinPermanently(items[i].path);
                                }
                                RefreshBinList.refreshBinList(vaultFs, binModel);
                            }
                        }
                    }
                }
            }
        }
    }
}
