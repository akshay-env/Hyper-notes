#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QSurfaceFormat>

int main(int argc, char *argv[])
{
    // 4x MSAA so the graph's edge lines (GL_LINES scene-graph geometry) render
    // cleanly anti-aliased instead of jagged/stair-stepped on diagonals.
    QSurfaceFormat fmt = QSurfaceFormat::defaultFormat();
    fmt.setSamples(4);
    QSurfaceFormat::setDefaultFormat(fmt);

    QGuiApplication app(argc, argv);
    app.setOrganizationName("HyperLinkNotes");
    app.setApplicationName("HyperLinkNotes");
    QQmlApplicationEngine engine;

    QObject::connect(
        &engine,
        &QQmlApplicationEngine::objectCreationFailed,
        &app,
        []() { QCoreApplication::exit(-1); },
        Qt::QueuedConnection);
    engine.loadFromModule("HyperLinkNotes", "Main");

    return app.exec();
}
