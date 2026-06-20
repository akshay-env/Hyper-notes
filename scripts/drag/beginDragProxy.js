.pragma library
.import "updateDragProxy.js" as UpdateDrag

function beginDragProxy(window, nodes, globalX, globalY) {
    window.dragSourceNodes = nodes;
    window.isDraggingNode = true;
    UpdateDrag.updateDragProxy(window, globalX, globalY);
}
