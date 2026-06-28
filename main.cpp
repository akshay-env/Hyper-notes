#include <QGuiApplication>
#include <QQmlApplicationEngine>

int main(int argc, char *argv[])
{
    // NOTE: the graph's edge lines (GL_LINES geometry) get their anti-aliasing
    // from a multisampled layer scoped to the graph item (see GraphView.qml), not
    // a global 4x MSAA default surface — a global multisampled surface taxed the
    // whole window's compositing every frame.

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
