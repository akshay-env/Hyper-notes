import QtQuick

// Obsidian-style tab bar. Reads window.openTabs / window.activeTabIndex and
// drives window.selectTab / closeTab / newTab.
Rectangle {
    id: root
    color: "#101010"
    clip: true

    // Bottom hairline separating the tabs from the editor
    Rectangle {
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        height: 1
        color: "#1e1e1e"
    }

    Row {
        id: tabsRow
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.leftMargin: 8
        spacing: 0

        Repeater {
            model: window.openTabs

            delegate: Rectangle {
                id: tabDelegate
                width: 180
                height: root.height
                property bool isActive: index === window.activeTabIndex
                color: isActive ? "#1e1e1e"
                                : (tabHover.containsMouse ? "#181818" : "transparent")

                // Right divider
                Rectangle {
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    width: 1
                    height: parent.height * 0.5
                    color: "#2a2a2a"
                }

                // Active-tab top accent
                Rectangle {
                    anchors.top: parent.top
                    anchors.left: parent.left
                    anchors.right: parent.right
                    height: 2
                    color: "#a882ff"
                    visible: tabDelegate.isActive
                }

                Text {
                    anchors.left: parent.left
                    anchors.leftMargin: 12
                    anchors.right: closeBtn.left
                    anchors.rightMargin: 6
                    anchors.verticalCenter: parent.verticalCenter
                    text: (modelData.name && modelData.name !== "") ? modelData.name : "New tab"
                    color: tabDelegate.isActive ? "#e0e0e0" : "#9a9a9a"
                    font.pixelSize: 12
                    font.family: "Segoe UI"
                    elide: Text.ElideRight
                }

                // Close (×)
                Rectangle {
                    id: closeBtn
                    anchors.right: parent.right
                    anchors.rightMargin: 8
                    anchors.verticalCenter: parent.verticalCenter
                    width: 18
                    height: 18
                    radius: 3
                    color: closeHover.containsMouse ? "#333333" : "transparent"

                    Text {
                        anchors.centerIn: parent
                        text: "×"
                        color: "#bbbbbb"
                        font.pixelSize: 15
                    }

                    MouseArea {
                        id: closeHover
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: window.closeTab(index)
                    }
                }

                MouseArea {
                    id: tabHover
                    anchors.fill: parent
                    anchors.rightMargin: 26   // keep the close button clickable
                    hoverEnabled: true
                    onClicked: window.selectTab(index)
                }
            }
        }

        // New-tab (+) button
        Rectangle {
            width: 34
            height: root.height
            color: plusHover.containsMouse ? "#181818" : "transparent"

            Text {
                anchors.centerIn: parent
                text: "+"
                color: "#aaaaaa"
                font.pixelSize: 18
            }

            MouseArea {
                id: plusHover
                anchors.fill: parent
                hoverEnabled: true
                onClicked: window.newTab()
            }
        }
    }
}
