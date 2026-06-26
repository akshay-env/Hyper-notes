pragma Singleton
import QtQuick

// Central palette + motion tokens. `mode` selects one of several full palettes;
// changing it live re-themes the whole app (every component reads Theme.<token>).
// Driven from Settings via a Binding in Main.qml.
QtObject {
    id: theme

    // "goldenSlate" | "light" | "highContrast" | "midnightIndigo" | "emeraldNoir"
    property string mode: "goldenSlate"

    readonly property var _all: ({
        "goldenSlate": {
            bg: "#0a0b0d", surface: "#101216", surface2: "#16191f", elevated: "#20242b",
            overlayHover: Qt.rgba(1, 1, 1, 0.05), border: "#282d35", divider: "#1c2027",
            text: "#eef0f2", textDim: "#9da3ac", textMuted: "#686e78", textFaint: "#444a54",
            accent: "#ffd23f", accentHover: "#ffe066", accentText: "#ffe98c", onAccent: "#0a0b0d",
            accentSoft: Qt.rgba(1.0, 0.824, 0.247, 0.18), accentSoftHi: Qt.rgba(1.0, 0.824, 0.247, 0.30),
            danger: "#ef5f6b", dangerHover: "#ff7280", dangerSoft: Qt.rgba(0.94, 0.37, 0.42, 0.13),
            highlight: "#ffd479", graphBg: "#0c0d10",
            node: "#9da3ac", nodeNeighbor: "#d6dae0", nodeActive: "#ffd23f", nodeHi: "#ffffff"
        },
        "light": {
            bg: "#f7f6f2", surface: "#ffffff", surface2: "#efece4", elevated: "#e6e2d8",
            overlayHover: Qt.rgba(0, 0, 0, 0.05), border: "#e3dfd5", divider: "#ece8de",
            text: "#20242e", textDim: "#5a606c", textMuted: "#888e98", textFaint: "#b6bac2",
            accent: "#d99a16", accentHover: "#c2870c", accentText: "#8a5e00", onAccent: "#2a1d00",
            accentSoft: Qt.rgba(0.851, 0.604, 0.086, 0.16), accentSoftHi: Qt.rgba(0.851, 0.604, 0.086, 0.26),
            danger: "#d3384a", dangerHover: "#bb2a3b", dangerSoft: Qt.rgba(0.827, 0.22, 0.29, 0.10),
            highlight: "#d99a16", graphBg: "#f1efe8",
            node: "#a0a6b0", nodeNeighbor: "#5a606c", nodeActive: "#d99a16", nodeHi: "#20242e"
        },
        "highContrast": {
            bg: "#000000", surface: "#0a0a0a", surface2: "#141414", elevated: "#1f1f1f",
            overlayHover: Qt.rgba(1, 1, 1, 0.08), border: "#3a3a3a", divider: "#262626",
            text: "#ffffff", textDim: "#c8c8c8", textMuted: "#909090", textFaint: "#5a5a5a",
            accent: "#ffe000", accentHover: "#fff04d", accentText: "#ffe000", onAccent: "#000000",
            accentSoft: Qt.rgba(1.0, 0.878, 0.0, 0.20), accentSoftHi: Qt.rgba(1.0, 0.878, 0.0, 0.32),
            danger: "#ff3b3b", dangerHover: "#ff5c5c", dangerSoft: Qt.rgba(1.0, 0.23, 0.23, 0.16),
            highlight: "#ffe000", graphBg: "#000000",
            node: "#b0b0b0", nodeNeighbor: "#ffffff", nodeActive: "#ffe000", nodeHi: "#ffffff"
        },
        "midnightIndigo": {
            bg: "#0a0c18", surface: "#111530", surface2: "#161b3d", elevated: "#1f2550",
            overlayHover: Qt.rgba(1, 1, 1, 0.05), border: "#262d52", divider: "#1a2040",
            text: "#e7e9f5", textDim: "#9aa0c4", textMuted: "#6a7099", textFaint: "#454b73",
            accent: "#8b7df6", accentHover: "#9d90f8", accentText: "#c7bdff", onAccent: "#0a0c18",
            accentSoft: Qt.rgba(0.545, 0.49, 0.965, 0.18), accentSoftHi: Qt.rgba(0.545, 0.49, 0.965, 0.30),
            danger: "#ef5f6b", dangerHover: "#ff7280", dangerSoft: Qt.rgba(0.94, 0.37, 0.42, 0.13),
            highlight: "#a892ff", graphBg: "#0a0c18",
            node: "#9aa0c4", nodeNeighbor: "#d2d6f0", nodeActive: "#a892ff", nodeHi: "#ffffff"
        },
        "emeraldNoir": {
            bg: "#07120e", surface: "#0c1a14", surface2: "#11241b", elevated: "#163026",
            overlayHover: Qt.rgba(1, 1, 1, 0.05), border: "#1d3b2e", divider: "#14271f",
            text: "#e6f0ea", textDim: "#93b3a4", textMuted: "#5f7d6f", textFaint: "#3c5248",
            accent: "#34d399", accentHover: "#4ee0a8", accentText: "#9af0cf", onAccent: "#07120e",
            accentSoft: Qt.rgba(0.204, 0.827, 0.6, 0.16), accentSoftHi: Qt.rgba(0.204, 0.827, 0.6, 0.28),
            danger: "#ef5f6b", dangerHover: "#ff7280", dangerSoft: Qt.rgba(0.94, 0.37, 0.42, 0.13),
            highlight: "#34d399", graphBg: "#07120e",
            node: "#93b3a4", nodeNeighbor: "#cfe6da", nodeActive: "#34d399", nodeHi: "#ffffff"
        }
    })

    readonly property var _p: _all[mode] !== undefined ? _all[mode] : _all["goldenSlate"]

    // ── Surfaces ─────────────────────────────────────────────────────────────
    readonly property color bg:           _p.bg
    readonly property color surface:      _p.surface
    readonly property color surface2:     _p.surface2
    readonly property color elevated:     _p.elevated
    readonly property color overlayHover: _p.overlayHover

    // ── Borders / dividers ──────────────────────────────────────────────────
    readonly property color border:       _p.border
    readonly property color divider:      _p.divider

    // ── Text ────────────────────────────────────────────────────────────────
    readonly property color text:         _p.text
    readonly property color textDim:      _p.textDim
    readonly property color textMuted:    _p.textMuted
    readonly property color textFaint:    _p.textFaint

    // ── Accent ───────────────────────────────────────────────────────────────
    readonly property color accent:       _p.accent
    readonly property color accentHover:  _p.accentHover
    readonly property color accentText:   _p.accentText
    readonly property color onAccent:     _p.onAccent   // text/icons placed ON the accent
    readonly property color accentSoft:   _p.accentSoft
    readonly property color accentSoftHi: _p.accentSoftHi

    // ── Status ──────────────────────────────────────────────────────────────
    readonly property color danger:       _p.danger
    readonly property color dangerHover:  _p.dangerHover
    readonly property color dangerSoft:   _p.dangerSoft
    readonly property color highlight:    _p.highlight

    // ── Graph ───────────────────────────────────────────────────────────────
    readonly property color graphBg:      _p.graphBg
    readonly property color node:         _p.node
    readonly property color nodeNeighbor: _p.nodeNeighbor
    readonly property color nodeActive:   _p.nodeActive
    readonly property color nodeHi:       _p.nodeHi

    // ── Motion ──────────────────────────────────────────────────────────────
    readonly property int animFast: 110
    readonly property int animMed:  160
}
