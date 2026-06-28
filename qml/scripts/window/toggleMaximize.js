.pragma library

function toggleMaximize(window) {
    if (window.isMaximized) {
        window.showNormal();
        window.isMaximized = false;
    } else {
        window.showMaximized();
        window.isMaximized = true;
    }
}
