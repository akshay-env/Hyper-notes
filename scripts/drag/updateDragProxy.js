.pragma library

function updateDragProxy(window, globalX, globalY) {
    window.dragVisualProxy.x = globalX - window.dragVisualProxy.width / 2;
    window.dragVisualProxy.y = globalY - window.dragVisualProxy.height / 2;
}
