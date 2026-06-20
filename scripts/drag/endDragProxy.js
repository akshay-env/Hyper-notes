.pragma library

function endDragProxy(window) {
    window.dragVisualProxy.doDrop();
    window.isDraggingNode = false;
}
