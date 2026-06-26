import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import HyperLinkNotes

// In-app settings. A centered modal card over a dimmed backdrop (same pattern as
// BinPanel), driven by window.settingsOpen. Currently holds the LLM API key.
Item {
    id: settingsPanel
    anchors.fill: parent
    visible: window.settingsOpen
    z: 200

    // Two-way wiring to the persisted values lives in Main.qml: the `*` props are
    // fed in, the `*Edited` signals fire on every user change.
    property string apiKey: ""
    signal apiKeyEdited(string key)
    property string provider: "anthropic"
    signal providerEdited(string p)
    property string baseUrl: ""
    signal baseUrlEdited(string u)
    property string model: ""
    signal modelEdited(string m)
    property string theme: "goldenSlate"
    signal themeEdited(string t)

    property bool showKey: false

    function close() { window.settingsOpen = false; }

    onVisibleChanged: {
        if (visible) {
            keyField.text = apiKey;     // seed without a live binding (no cursor jumps)
            modelField.text = model;
            baseUrlField.text = baseUrl;
            showKey = false;
        }
    }

    // ── Dimmed backdrop ──────────────────────────────────────────────────────
    Rectangle {
        anchors.fill: parent
        color: "#000000"
        opacity: 0.5
        MouseArea {
            anchors.fill: parent
            onClicked: settingsPanel.close()
        }
    }

    // ── Centered card ────────────────────────────────────────────────────────
    Rectangle {
        id: card
        anchors.centerIn: parent
        width: Math.min(460, parent.width - 80)
        height: layout.implicitHeight + 36
        color: Theme.surface
        border.color: Theme.border
        border.width: 1
        radius: 12

        MouseArea { anchors.fill: parent }   // swallow clicks so they don't dismiss

        ColumnLayout {
            id: layout
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 18
            spacing: 16

            // Header
            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                Canvas {
                    width: 17
                    height: 17
                    Layout.alignment: Qt.AlignVCenter
                    onPaint: {
                        var ctx = getContext("2d");
                        ctx.reset();
                        ctx.strokeStyle = Theme.text;
                        ctx.lineWidth = 1.3;
                        ctx.lineJoin = "round";
                        var cx = width / 2, cy = height / 2;
                        var rBody = 4.4, rTeeth = 6.8;
                        ctx.beginPath(); ctx.arc(cx, cy, rBody, 0, 2 * Math.PI); ctx.stroke();
                        ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, 2 * Math.PI); ctx.stroke();
                        for (var i = 0; i < 8; i++) {
                            var a = i * Math.PI / 4;
                            ctx.beginPath();
                            ctx.moveTo(cx + Math.cos(a) * rBody, cy + Math.sin(a) * rBody);
                            ctx.lineTo(cx + Math.cos(a) * rTeeth, cy + Math.sin(a) * rTeeth);
                            ctx.stroke();
                        }
                    }
                }

                Text {
                    text: "Settings"
                    color: Theme.text
                    font.pixelSize: 16
                    font.bold: true
                    font.family: "Segoe UI"
                }

                Item { Layout.fillWidth: true }

                Rectangle {
                    width: 28; height: 28; radius: 6
                    color: closeHover.containsMouse ? Theme.elevated : "transparent"
                    Behavior on color { ColorAnimation { duration: Theme.animFast } }
                    Text { anchors.centerIn: parent; text: "✕"; color: Theme.textDim; font.pixelSize: 13 }
                    MouseArea {
                        id: closeHover
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: settingsPanel.close()
                    }
                }
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.divider }

            // Section
            Text {
                text: "LANGUAGE MODEL"
                color: Theme.textMuted
                font.pixelSize: 11
                font.bold: true
                font.letterSpacing: 0.5
                font.family: "Segoe UI"
            }

            // Provider
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 6

                Text {
                    text: "Provider"
                    color: Theme.textDim
                    font.pixelSize: 12
                    font.family: "Segoe UI"
                }

                Row {
                    spacing: 8
                    Repeater {
                        model: [
                            { key: "anthropic", label: "Anthropic" },
                            { key: "openai", label: "OpenAI" },
                            { key: "custom", label: "Custom" }
                        ]
                        delegate: Rectangle {
                            id: provPill
                            width: provLabel.implicitWidth + 24
                            height: 30
                            radius: 6
                            property bool selected: settingsPanel.provider === modelData.key
                            color: selected ? Theme.accent
                                            : (provHover.containsMouse ? Theme.elevated : Theme.surface2)
                            border.color: selected ? Theme.accent : Theme.border
                            border.width: 1
                            Behavior on color { ColorAnimation { duration: Theme.animFast } }

                            Text {
                                id: provLabel
                                anchors.centerIn: parent
                                text: modelData.label
                                color: provPill.selected ? Theme.onAccent : Theme.textDim
                                font.pixelSize: 12
                                font.bold: provPill.selected
                                font.family: "Segoe UI"
                            }
                            MouseArea {
                                id: provHover
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: settingsPanel.providerEdited(modelData.key)
                            }
                        }
                    }
                }
            }

            // Base URL (only for the Custom / OpenAI-compatible provider)
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 6
                visible: settingsPanel.provider === "custom"

                Text {
                    text: "Base URL"
                    color: Theme.textDim
                    font.pixelSize: 12
                    font.family: "Segoe UI"
                }

                Rectangle {
                    Layout.fillWidth: true
                    height: 38
                    radius: 6
                    color: Theme.surface2
                    border.color: baseUrlField.activeFocus ? Theme.accent : Theme.border
                    border.width: 1
                    Behavior on border.color { ColorAnimation { duration: Theme.animFast } }

                    TextField {
                        id: baseUrlField
                        anchors.fill: parent
                        anchors.leftMargin: 10
                        anchors.rightMargin: 10
                        verticalAlignment: TextInput.AlignVCenter
                        placeholderText: "https://openrouter.ai/api/v1"
                        placeholderTextColor: Theme.textFaint
                        color: Theme.text
                        font.pixelSize: 13
                        font.family: "Consolas, Segoe UI"
                        selectionColor: Theme.accent
                        selectedTextColor: Theme.onAccent
                        background: null
                        leftPadding: 0
                        onTextEdited: settingsPanel.baseUrlEdited(text)
                    }
                }
            }

            // API key field
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 6

                Text {
                    text: "API key"
                    color: Theme.textDim
                    font.pixelSize: 12
                    font.family: "Segoe UI"
                }

                Rectangle {
                    Layout.fillWidth: true
                    height: 38
                    radius: 6
                    color: Theme.surface2
                    border.color: keyField.activeFocus ? Theme.accent : Theme.border
                    border.width: 1
                    Behavior on border.color { ColorAnimation { duration: Theme.animFast } }

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 10
                        anchors.rightMargin: 10
                        spacing: 8

                        TextField {
                            id: keyField
                            Layout.fillWidth: true
                            placeholderText: "Paste your API key…"
                            placeholderTextColor: Theme.textFaint
                            color: Theme.text
                            font.pixelSize: 13
                            font.family: "Consolas, Segoe UI"
                            echoMode: settingsPanel.showKey ? TextInput.Normal : TextInput.Password
                            selectionColor: Theme.accent
                            selectedTextColor: Theme.onAccent
                            background: null
                            leftPadding: 0
                            onTextEdited: settingsPanel.apiKeyEdited(text)
                        }

                        Text {
                            text: settingsPanel.showKey ? "Hide" : "Show"
                            color: showHover.containsMouse ? Theme.accentHover : Theme.accent
                            font.pixelSize: 12
                            font.family: "Segoe UI"
                            Layout.alignment: Qt.AlignVCenter
                            MouseArea {
                                id: showHover
                                anchors.fill: parent
                                anchors.margins: -4
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: settingsPanel.showKey = !settingsPanel.showKey
                            }
                        }
                    }
                }

                Text {
                    text: "Stored locally on this device. Leave blank to disable AI features."
                    color: Theme.textMuted
                    font.pixelSize: 11
                    font.family: "Segoe UI"
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                }
            }

            // Model
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 6

                Text {
                    text: "Model"
                    color: Theme.textDim
                    font.pixelSize: 12
                    font.family: "Segoe UI"
                }

                Rectangle {
                    Layout.fillWidth: true
                    height: 38
                    radius: 6
                    color: Theme.surface2
                    border.color: modelField.activeFocus ? Theme.accent : Theme.border
                    border.width: 1
                    Behavior on border.color { ColorAnimation { duration: Theme.animFast } }

                    TextField {
                        id: modelField
                        anchors.fill: parent
                        anchors.leftMargin: 10
                        anchors.rightMargin: 10
                        verticalAlignment: TextInput.AlignVCenter
                        placeholderText: settingsPanel.provider === "anthropic" ? "e.g. claude-sonnet-4-6" : "e.g. gpt-4o"
                        placeholderTextColor: Theme.textFaint
                        color: Theme.text
                        font.pixelSize: 13
                        font.family: "Consolas, Segoe UI"
                        selectionColor: Theme.accent
                        selectedTextColor: Theme.onAccent
                        background: null
                        leftPadding: 0
                        onTextEdited: settingsPanel.modelEdited(text)
                    }
                }
            }

            Rectangle { Layout.fillWidth: true; height: 1; color: Theme.divider }

            // Appearance / theme
            Text {
                text: "APPEARANCE"
                color: Theme.textMuted
                font.pixelSize: 11
                font.bold: true
                font.letterSpacing: 0.5
                font.family: "Segoe UI"
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 6

                Text {
                    text: "Theme"
                    color: Theme.textDim
                    font.pixelSize: 12
                    font.family: "Segoe UI"
                }

                Flow {
                    Layout.fillWidth: true
                    spacing: 8

                    Repeater {
                        model: [
                            { key: "goldenSlate",    label: "Golden Slate",   bg: "#0a0b0d", ac: "#ffd23f" },
                            { key: "light",          label: "Light",          bg: "#f7f6f2", ac: "#d99a16" },
                            { key: "highContrast",   label: "High Contrast",  bg: "#000000", ac: "#ffe000" },
                            { key: "midnightIndigo", label: "Midnight Indigo",bg: "#0a0c18", ac: "#8b7df6" },
                            { key: "emeraldNoir",    label: "Emerald Noir",   bg: "#07120e", ac: "#34d399" }
                        ]
                        delegate: Rectangle {
                            id: themeSwatch
                            width: 96
                            height: 48
                            radius: 8
                            color: modelData.bg
                            property bool selected: settingsPanel.theme === modelData.key
                            border.color: selected ? Theme.accent : Theme.border
                            border.width: selected ? 2 : 1

                            Rectangle {
                                x: 9; y: 9
                                width: 14; height: 14; radius: 7
                                color: modelData.ac
                            }
                            Text {
                                anchors.left: parent.left
                                anchors.leftMargin: 9
                                anchors.bottom: parent.bottom
                                anchors.bottomMargin: 7
                                width: parent.width - 16
                                text: modelData.label
                                color: modelData.key === "light" ? "#20242e" : "#ffffff"
                                font.pixelSize: 9
                                font.family: "Segoe UI"
                                elide: Text.ElideRight
                            }
                            MouseArea {
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: settingsPanel.themeEdited(modelData.key)
                            }
                        }
                    }
                }
            }

            // Done
            Rectangle {
                Layout.alignment: Qt.AlignRight
                width: 86
                height: 32
                radius: 6
                color: doneHover.containsMouse ? Theme.accentHover : Theme.accent
                Behavior on color { ColorAnimation { duration: Theme.animFast } }
                Text {
                    anchors.centerIn: parent
                    text: "Done"
                    color: Theme.onAccent
                    font.pixelSize: 13
                    font.bold: true
                    font.family: "Segoe UI"
                }
                MouseArea {
                    id: doneHover
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: settingsPanel.close()
                }
            }
        }
    }

    Keys.onEscapePressed: close()
    focus: visible
}
