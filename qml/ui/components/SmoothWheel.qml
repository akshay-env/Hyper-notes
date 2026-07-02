import QtQuick

// Smooth, higher-sensitivity mouse-wheel scrolling for any Flickable/ListView.
// Drop it in as a SIBLING placed in FRONT of (i.e. after) the target, covering the
// same area, e.g.  SmoothWheel { anchors.fill: theList; flick: theList }
//
// Each wheel notch animates contentY (a glide, not an instant jump), so scrolling
// reads as smooth / high-fps; `step` is how far one notch travels (sensitivity).
// WheelHandler.blocking is true by default, so the list behind never double-scrolls.
// There's no MouseArea here, so clicks / hover / drag pass straight through; and
// touchpad scrolling falls through to the Flickable's own native pixel scrolling.
Item {
    id: root

    property Flickable flick: null
    property real step: 150        // pixels per wheel notch — higher = more sensitive
    property int duration: 220     // glide time in ms — higher = smoother / floatier

    property real _target: 0

    NumberAnimation {
        id: glide
        target: root.flick
        property: "contentY"
        duration: root.duration
        easing.type: Easing.OutCubic
    }

    WheelHandler {
        acceptedDevices: PointerDevice.Mouse   // touchpad → native pixel scrolling
        onWheel: (event) => {
            if (!root.flick)
                return;
            // Clamp to the flickable's REAL range [originY, originY+contentHeight-height].
            // originY is negative when there's a ListView header (e.g. the note title),
            // so hardcoding 0 as the minimum made the wheel jump PAST the header and
            // never scroll back up to it. Floor the max so a fractional bound doesn't
            // land a sub-pixel past the bottom (which fixup-snaps — the end glitch).
            var minY = root.flick.originY;
            var maxY = Math.floor(root.flick.originY + root.flick.contentHeight - root.flick.height);
            if (maxY <= minY)
                return;
            // Accumulate onto the in-flight target so fast successive notches add up
            // instead of each one restarting from a stale position.
            var base = glide.running ? root._target : root.flick.contentY;
            var dy = (event.angleDelta.y / 120) * root.step;
            var next = Math.max(minY, Math.min(maxY, base - dy));
            // Already gliding to this exact bound (you're holding the wheel at the
            // top/bottom) — don't restart a zero-distance animation each notch; that
            // churn was the stutter/glitch at the end.
            if (glide.running && next === root._target)
                return;
            root._target = next;
            glide.to = next;
            glide.restart();
        }
    }
}
