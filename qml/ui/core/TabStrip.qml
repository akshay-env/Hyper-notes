import QtQuick
import HyperLinkNotes

// Obsidian-style tab bar. Reads window.openTabs / window.activeTabIndex and
// drives window.selectTab / closeTab / newTab / moveTab.
//
// Tabs share one width that shrinks as more are opened so they always fit the
// available space (down to a small minimum). Tabs can be dragged to reorder.
Rectangle {
    id: root
    // The bar sits a touch darker than the editor pane; the active tab matches
    // the pane so it reads as one continuous surface (no seam under it).
    color: Qt.darker(Theme.bg, 1.4)
    clip: true

    readonly property int plusWidth: 34
    readonly property int maxTabWidth: 180
    readonly property int tabCount: window.openTabs.length

    // One width for every tab; shrink to fit the strip (minus the + button).
    readonly property real tabWidth: {
        if (tabCount <= 0) return maxTabWidth;
        var avail = root.width - plusWidth;
        return Math.max(24, Math.min(maxTabWidth, avail / tabCount));
    }

    // Full-width bottom divider separating the tab strip from the content below.
    // Declared before the tabs so the active tab's gold underline draws over it.
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: 1
        color: Theme.border
    }

    Row {
        id: tabsRow
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        spacing: 0

        Repeater {
            model: window.openTabs

            delegate: Item {
                id: tabItem
                width: root.tabWidth
                height: root.height
                z: dragArea.dragging ? 100 : 1

                property bool isActive: index === window.activeTabIndex
                // Hide the close button on tiny inactive tabs to save room.
                property bool showClose: root.tabWidth >= 64 || isActive

                Rectangle {
                    id: content
                    width: parent.width
                    height: parent.height
                    x: 0
                    // Active tab reads via the gold underline + brighter text; the
                    // bar/active fills stay flat now that a divider separates the
                    // strip from the content below.
                    color: tabItem.isActive ? "transparent"
                                            : (dragArea.containsMouse ? Theme.surface : "transparent")
                    opacity: dragArea.dragging ? 0.85 : 1.0

                    Behavior on color { ColorAnimation { duration: Theme.animFast } }

                    // Right divider (hidden on the active tab)
                    Rectangle {
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        width: 1
                        height: parent.height * 0.5
                        color: Theme.border
                        visible: !tabItem.isActive
                    }

                    // Active-tab gold underline — sits over the strip divider.
                    Rectangle {
                        anchors.bottom: parent.bottom
                        anchors.left: parent.left
                        anchors.right: parent.right
                        height: 2
                        color: Theme.accent
                        visible: tabItem.isActive
                        z: 5
                    }

                    Text {
                        anchors.left: parent.left
                        anchors.leftMargin: 10
                        anchors.right: closeBtn.visible ? closeBtn.left : parent.right
                        anchors.rightMargin: 6
                        anchors.verticalCenter: parent.verticalCenter
                        text: (modelData.name && modelData.name !== "") ? modelData.name : "New tab"
                        color: tabItem.isActive ? Theme.text : Theme.textDim
                        font.pixelSize: 12
                        font.family: "Segoe UI"
                        elide: Text.ElideRight

                        Behavior on color { ColorAnimation { duration: Theme.animFast } }
                    }

                    Rectangle {
                        id: closeBtn
                        visible: tabItem.showClose
                        anchors.right: parent.right
                        anchors.rightMargin: 6
                        anchors.verticalCenter: parent.verticalCenter
                        width: 16
                        height: 16
                        radius: 3
                        color: closeHover.containsMouse ? Theme.elevated : "transparent"

                        Text {
                            anchors.centerIn: parent
                            text: "×"
                            color: closeHover.containsMouse ? Theme.text : Theme.textDim
                            font.pixelSize: 14
                        }

                        MouseArea {
                            id: closeHover
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: window.closeTab(index)
                        }
                    }
                }

                // Drag to reorder + click to select. The rightmost strip is left
                // uncovered so the close button stays clickable.
                MouseArea {
                    id: dragArea
                    anchors.fill: parent
                    anchors.rightMargin: tabItem.showClose ? 24 : 0
                    hoverEnabled: true

                    property real pressX: 0
                    property bool dragging: false
                    property int targetIndex: index

                    onPressed: (mouse) => {
                        pressX = mouse.x;
                        dragging = false;
                        targetIndex = index;
                    }

                    onPositionChanged: (mouse) => {
                        if (!(mouse.buttons & Qt.LeftButton)) return;
                        var dx = mouse.x - pressX;
                        if (!dragging && Math.abs(dx) > 6) dragging = true;
                        if (dragging) {
                            content.x = dx;
                            var centerInRow = tabItem.x + content.x + content.width / 2;
                            var ti = Math.floor(centerInRow / root.tabWidth);
                            ti = Math.max(0, Math.min(window.openTabs.length - 1, ti));
                            targetIndex = ti;
                        }
                    }

                    onReleased: {
                        if (dragging) {
                            content.x = 0;
                            dragging = false;
                            if (targetIndex !== index) window.moveTab(index, targetIndex);
                        }
                    }

                    onClicked: {
                        if (!dragging) window.selectTab(index);
                    }
                }
            }
        }

        // New-tab (+) button
        Rectangle {
            width: root.plusWidth
            height: root.height
            color: plusHover.containsMouse ? Theme.surface : "transparent"

            Behavior on color { ColorAnimation { duration: Theme.animFast } }

            Text {
                anchors.centerIn: parent
                text: "+"
                color: plusHover.containsMouse ? Theme.text : Theme.textDim
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
