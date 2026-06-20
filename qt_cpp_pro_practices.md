# Extreme Pro-Level Qt + C++ Programming Practices

A complete, exhaustive reference for senior/expert developers.

---

## 1. PROJECT ARCHITECTURE & STRUCTURE

### 1.1 Layered Architecture
Enforce strict layer separation: UI layer → Presentation/ViewModel layer → Business Logic layer → Data Access/Repository layer → Infrastructure. No layer skips. Each layer communicates only with the one directly below it. This makes components independently testable and replaceable.

### 1.2 MVVM with Qt
Model-View-ViewModel is the gold standard for Qt. The ViewModel exposes data via `Q_PROPERTY` bindings with `NOTIFY` signals. Views (QML or QWidget) bind to these. The model (data store) is completely decoupled from the UI. The ViewModel doesn't know what view is using it.

```cpp
class UserViewModel : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString displayName READ displayName NOTIFY displayNameChanged)
    Q_PROPERTY(bool isLoading READ isLoading NOTIFY isLoadingChanged)
public:
    // No QWidget/QML includes here — ever
    void load(int userId);
signals:
    void displayNameChanged();
    void isLoadingChanged();
    void errorOccurred(const QString& message);
private:
    UserRepository* m_repo;
    QString m_displayName;
    bool m_isLoading = false;
};
```

### 1.3 Strict Module Boundaries with CMake
Each logical module is a separate CMake library target with explicit public/private headers, dependencies declared via `target_link_libraries`, and nothing leaking between boundaries. Use `PRIVATE` for internal dependencies, `PUBLIC` only when part of the API.

```cmake
add_library(UserModule STATIC
    src/UserRepository.cpp
    src/UserViewModel.cpp
)
target_include_directories(UserModule
    PUBLIC  include/
    PRIVATE src/
)
target_link_libraries(UserModule
    PRIVATE Qt6::Sql Qt6::Network
    PUBLIC  CoreModule
)
```

### 1.4 Physical Design — Keep Build Times Fast
Use forward declarations aggressively in headers. Only `#include` what you actually use in that header. Move everything else to the `.cpp`. A header should almost never include another header unless it is part of the public API type signature.

```cpp
// UserService.h — GOOD
class QObject;
class UserRepository; // forward declare, don't include
class UserService : public QObject { ... };

// UserService.cpp — include what you need here
#include "UserService.h"
#include "UserRepository.h"
#include <QObject>
```

### 1.5 Precompiled Headers
Use precompiled headers for heavy Qt includes. In CMake:

```cmake
target_precompile_headers(MyApp PRIVATE
    <QObject>
    <QString>
    <QList>
    <QHash>
    <memory>
    <optional>
)
```

### 1.6 Namespace Everything
Wrap all your code in namespaces matching the module. Never pollute the global namespace. Nested namespaces for sub-components.

```cpp
namespace MyApp::Core::Network {
    class HttpClient { ... };
}
```

### 1.7 Explicit Version Headers
Every library you ship exposes a version header with compile-time version macros. Consumers can `#if` against them for compatibility.

```cpp
// version.h
#define MYLIB_VERSION_MAJOR 2
#define MYLIB_VERSION_MINOR 5
#define MYLIB_VERSION_PATCH 1
#define MYLIB_VERSION_CHECK(maj, min, patch) \
    ((maj<<16)|(min<<8)|patch) <= \
    ((MYLIB_VERSION_MAJOR<<16)|(MYLIB_VERSION_MINOR<<8)|MYLIB_VERSION_PATCH)
```

---

## 2. C++ CORE LANGUAGE — MODERN PRACTICES

### 2.1 Rule of Zero (Preferred)
Design classes so the compiler-generated Big Five (destructor, copy ctor, move ctor, copy assign, move assign) are correct by default. Use smart pointers and RAII containers as members so you never have to write them manually.

```cpp
// Rule of Zero — compiler does the right thing automatically
class Document {
    std::unique_ptr<DocumentPrivate> d;
    QString m_title;
    QList<Page> m_pages;
    // No destructor, no copy/move needed — compiler handles it
};
```

### 2.2 Rule of Five (When You Must)
If you manage raw resources (custom allocator, file handle, socket, GPU buffer), implement all five explicitly. Never define just one or two.

```cpp
class RawBuffer {
public:
    RawBuffer(size_t size);
    ~RawBuffer();
    RawBuffer(const RawBuffer& other);
    RawBuffer(RawBuffer&& other) noexcept;
    RawBuffer& operator=(const RawBuffer& other);
    RawBuffer& operator=(RawBuffer&& other) noexcept;
private:
    std::byte* m_data = nullptr;
    size_t m_size = 0;
};
```

### 2.3 Mark Everything `const` That Should Be
Every member function that doesn't modify state is `const`. Every parameter you don't modify is `const`. Every local variable you don't reassign is `const`. This documents intent and enables compiler optimizations.

```cpp
QString UserService::formatName(const User& user) const {
    const QString first = user.firstName();
    const QString last  = user.lastName();
    return first + QLatin1Char(' ') + last;
}
```

### 2.4 `noexcept` Everywhere It's True
Mark move constructors, move assignment operators, swap functions, and any function that genuinely cannot throw as `noexcept`. This is critical: STL containers check `noexcept` on moves to decide whether to use move or copy, which affects performance enormously.

```cpp
Buffer(Buffer&& other) noexcept
    : m_data(std::exchange(other.m_data, nullptr))
    , m_size(std::exchange(other.m_size, 0))
{}
```

### 2.5 `[[nodiscard]]` on Return Values That Matter
Apply to functions whose return values should never be silently discarded — error codes, allocated resources, factory results.

```cpp
[[nodiscard]] std::unique_ptr<Session> createSession(const Config& cfg);
[[nodiscard]] bool save(const QString& path);
[[nodiscard]] ParseResult parseJson(const QByteArray& data);
```

### 2.6 `explicit` on Single-Argument Constructors
Prevent silent implicit conversions that create subtle bugs.

```cpp
class Timeout {
public:
    explicit Timeout(int ms) : m_ms(ms) {}
private:
    int m_ms;
};
// Timeout t = 5000; // ERROR — good, this was likely a bug
// Timeout t{5000};  // OK
```

### 2.7 Strongly Typed Enums (`enum class`)
Always use `enum class`. Plain `enum` pollutes the enclosing scope and silently converts to int. `enum class` forces explicit scoping and prevents arithmetic abuse.

```cpp
enum class ConnectionState { Disconnected, Connecting, Connected, Error };
enum class LogLevel { Debug, Info, Warning, Critical, Fatal };

// Force explicit use: ConnectionState::Connected, not just Connected
```

### 2.8 `std::optional` for Nullable Returns
Never return a raw pointer or a sentinel value like `-1` or empty string to mean "no result." Use `std::optional<T>`.

```cpp
std::optional<User> UserRepository::findById(int id) const {
    if (auto it = m_cache.find(id); it != m_cache.end())
        return it->second;
    return std::nullopt;
}

// Caller:
if (auto user = repo.findById(42)) {
    display(*user);
}
```

### 2.9 `std::variant` for Type-Safe Unions
Replace tagged unions, `void*`, or `QVariant` (when you know the type set) with `std::variant`.

```cpp
using ParseResult = std::variant<Document, ParseError>;

ParseResult parseXml(const QByteArray& data);

// Caller uses std::visit or std::holds_alternative
std::visit(overloaded{
    [](const Document& doc)   { process(doc); },
    [](const ParseError& err) { logError(err); }
}, result);
```

### 2.10 `std::string_view` and `QStringView` for Non-Owning References
Never copy a string just to read from it. Use views in function parameters.

```cpp
// BAD — copies the string
void log(const QString& message);

// GOOD — zero-copy, works with QString, QStringRef, string literals
void log(QStringView message);

// For C++ standard strings
void processName(std::string_view name);
```

### 2.11 `if constexpr` for Compile-Time Branching
Replace template specialization and `enable_if` nightmares with `if constexpr` for clearer compile-time branching.

```cpp
template<typename T>
void serialize(QDataStream& stream, const T& value) {
    if constexpr (std::is_enum_v<T>) {
        stream << static_cast<std::underlying_type_t<T>>(value);
    } else if constexpr (std::is_trivially_copyable_v<T>) {
        stream.writeRawData(reinterpret_cast<const char*>(&value), sizeof(T));
    } else {
        value.serialize(stream);
    }
}
```

### 2.12 Concepts (C++20) for Template Constraints
Replace SFINAE with readable Concepts. Documents requirements, gives better error messages.

```cpp
template<typename T>
concept Serializable = requires(T t, QDataStream& s) {
    { t.serialize(s) } -> std::same_as<void>;
    { T::deserialize(s) } -> std::same_as<T>;
};

template<Serializable T>
void saveToFile(const T& obj, const QString& path) { ... }
```

### 2.13 Structured Bindings
Use structured bindings for clarity when returning pairs, tuples, or structs.

```cpp
auto [success, errorCode] = network.connect(host, port);
auto [min, max]           = std::minmax(values);

for (auto& [key, value] : hashMap.asKeyValueRange())
    process(key, value);
```

### 2.14 Move Semantics Everywhere
Pass large objects by value to functions that will store them (enables move on rvalue), and use `std::move` explicitly when transferring ownership.

```cpp
// Perfect — either copies or moves depending on how it's called
UserViewModel::UserViewModel(UserRepository repo)
    : m_repo(std::move(repo)) {}

// Use std::move when you're done with an object
m_items.push_back(std::move(newItem));
```

### 2.15 Prefer Standard Algorithms Over Raw Loops
`std::find_if`, `std::transform`, `std::accumulate`, `std::any_of`, `std::all_of`, `std::none_of`, `std::sort`, `std::partition`, `std::copy_if` are all more expressive and often better optimized than manual loops. Name the intent.

```cpp
// BAD
bool hasAdmin = false;
for (const auto& user : users) {
    if (user.role() == Role::Admin) { hasAdmin = true; break; }
}

// GOOD
bool hasAdmin = std::any_of(users.begin(), users.end(),
    [](const User& u) { return u.role() == Role::Admin; });
```

### 2.16 Ranges (C++20) for Composable Transformations
Chain transformations lazily without intermediate allocations.

```cpp
#include <ranges>
auto activeAdminNames = users
    | std::views::filter([](const User& u) { return u.isActive() && u.isAdmin(); })
    | std::views::transform(&User::displayName);
```

### 2.17 `using` Type Aliases Over `typedef`
`using` is clearer, works with templates, and reads left to right.

```cpp
using UserMap  = QHash<int, User>;
using Callback = std::function<void(const Result&)>;
template<typename T>
using Container = QList<T>;
```

### 2.18 Avoid Macros — Almost Always
Replace macros with `constexpr` constants, `inline` functions, templates, or `[[attributes]]`. Macros don't respect scope, type, or namespaces.

```cpp
// BAD
#define MAX_RETRIES 3
#define SQUARE(x) ((x)*(x))

// GOOD
inline constexpr int kMaxRetries = 3;
template<typename T>
constexpr T square(T x) { return x * x; }
```

### 2.19 `override` and `final` Always
Every virtual function override must have `override`. It catches typos, wrong signatures, and missing base class changes at compile time. Use `final` to prevent further overriding when appropriate.

```cpp
class ConcreteWidget : public AbstractWidget {
    void render(QPainter* painter) const override;
    void resize(const QSize& size) override final;
};
```

### 2.20 `= delete` to Explicitly Disable Functions
When a class should not be copyable, movable, or constructable in a certain way, say it explicitly. Don't rely on "nobody will call that."

```cpp
class EventLoop {
public:
    EventLoop();
    EventLoop(const EventLoop&)            = delete;
    EventLoop& operator=(const EventLoop&) = delete;
    EventLoop(EventLoop&&)                 = delete;
    EventLoop& operator=(EventLoop&&)      = delete;
};
```

### 2.21 CRTP for Static Polymorphism
When virtual dispatch overhead is unacceptable (hot paths, value types), use CRTP for compile-time polymorphism.

```cpp
template<typename Derived>
class Serializer {
public:
    void serialize(QDataStream& stream) const {
        static_cast<const Derived*>(this)->serializeImpl(stream);
    }
};

class JsonSerializer : public Serializer<JsonSerializer> {
    void serializeImpl(QDataStream& stream) const { ... }
};
```

### 2.22 `std::exchange` for Clear Move Implementation
`std::exchange(old, new_val)` sets old to new_val and returns the original. Perfect for move constructors.

```cpp
Buffer(Buffer&& other) noexcept
    : m_data(std::exchange(other.m_data, nullptr))
    , m_size(std::exchange(other.m_size, 0)) {}
```

### 2.23 Prefer `emplace_back` Over `push_back`
`emplace_back` constructs in-place, avoiding a copy or move of a temporary.

```cpp
m_users.emplace_back(id, name, email); // constructs User directly in the vector
```

### 2.24 Reserve Container Capacity
If you know or can estimate the number of elements, call `reserve()` first to avoid repeated reallocations.

```cpp
QList<Result> results;
results.reserve(expectedCount);
for (auto& item : source) results.append(process(item));
```

### 2.25 `[[deprecated("reason")]]` on Old APIs
When deprecating, annotate it so consumers get compile-time warnings, not silent misbehavior.

```cpp
[[deprecated("Use loadAsync() instead; this blocks the main thread")]]
Data loadSync(const QString& path);
```

### 2.26 Designated Initializers (C++20) for Aggregate Init
Readable, self-documenting aggregate initialization.

```cpp
struct Config {
    int timeout   = 5000;
    int retries   = 3;
    bool verbose  = false;
    QString host  = "localhost";
};

auto cfg = Config{
    .timeout = 10000,
    .retries = 5,
    .host    = "production.server.com"
};
```

---

## 3. QT-SPECIFIC PRACTICES

### 3.1 New-Style Signal-Slot Syntax Always
The string-based `SIGNAL()`/`SLOT()` macros bypass the type system entirely. New-style connections are checked at compile time, support lambdas, and catch refactoring mistakes immediately.

```cpp
// NEVER — no type checking, crashes at runtime on mismatch
connect(btn, SIGNAL(clicked(bool)), this, SLOT(onClicked(bool)));

// ALWAYS
connect(btn, &QPushButton::clicked, this, &MyWidget::onClicked);
connect(btn, &QPushButton::clicked, this, [this](bool checked) {
    handleButtonClick(checked);
});
```

### 3.2 Always Pass Context Object to Lambda Connections
Without a context object, a lambda capturing `this` will be called even after `this` is destroyed, causing undefined behavior.

```cpp
// DANGEROUS — if 'this' is deleted, the lambda runs on a dead pointer
connect(source, &Source::ready, [this]() { update(); });

// SAFE — Qt disconnects automatically when 'this' is destroyed
connect(source, &Source::ready, this, [this]() { update(); });
```

### 3.3 QPointer for Cross-Object QObject References
When you hold a non-owning reference to a QObject that might be deleted independently, use `QPointer<T>`. It becomes `nullptr` automatically when the object is destroyed.

```cpp
QPointer<QDialog> m_previewDialog;

void openPreview() {
    if (m_previewDialog) {
        m_previewDialog->raise();
    } else {
        m_previewDialog = new PreviewDialog(this);
        m_previewDialog->show();
    }
}
```

### 3.4 Use `deleteLater()` for Self-Deleting Objects in Slots
Never call `delete this` inside a slot. The signal-slot machinery might still be walking the call stack. `deleteLater()` schedules deletion at the next event loop iteration.

```cpp
void NetworkReply::onFinished() {
    emit dataReceived(m_buffer);
    deleteLater(); // safe — not deleted until event loop returns
}
```

### 3.5 Leverage Qt's Parent-Child Ownership
Every `QObject` with a parent is automatically deleted when the parent is deleted. Use this to avoid manual memory management for UI trees and object graphs.

```cpp
// Layout, button, label are all children of the panel
// They're deleted when panel is deleted — no manual cleanup
auto* panel  = new QWidget(this);
auto* layout = new QVBoxLayout(panel);
auto* label  = new QLabel("Hello", panel);
auto* button = new QPushButton("OK", panel);
layout->addWidget(label);
layout->addWidget(button);
```

### 3.6 QStringLiteral for All String Literals
`QStringLiteral("text")` creates the `QString` at compile time in read-only memory. `QString("text")` allocates and copies at runtime. Use `QStringLiteral` everywhere you have a string literal.

```cpp
// BAD — runtime allocation and copy
setTitle(QString("Document Editor"));
setObjectName(QString("mainWindow"));

// GOOD — zero runtime overhead
setTitle(QStringLiteral("Document Editor"));
setObjectName(QStringLiteral("mainWindow"));
```

### 3.7 `QLatin1StringView` for ASCII Comparisons
For comparing or constructing strings from ASCII-only literals, `QLatin1StringView` avoids UTF-16 overhead.

```cpp
// For simple ASCII key lookup, avoid QStringLiteral's UTF-16
if (header == QLatin1StringView("Content-Type")) { ... }
if (method == QLatin1StringView("GET")) { ... }
```

### 3.8 PIMPL Idiom for Binary Compatibility (`QScopedPointer<Private>`)
The PIMPL (Pointer to Implementation) idiom hides private members from the header, preventing ABI breakage when private implementation changes. Qt itself uses this heavily (`QObjectPrivate`). Use `QScopedPointer` or `std::unique_ptr` for the private pointer.

```cpp
// myclass.h — public API never changes, even when impl changes
class MyClassPrivate;
class MyClass : public QObject {
    Q_OBJECT
public:
    explicit MyClass(QObject* parent = nullptr);
    ~MyClass();
    void doSomething();
private:
    Q_DECLARE_PRIVATE(MyClass)
    QScopedPointer<MyClassPrivate> const d_ptr;
};

// myclass_p.h — private, never shipped to consumers
class MyClassPrivate {
public:
    Q_DECLARE_PUBLIC(MyClass)
    MyClass* q_ptr;
    int internalState = 0;
    QString cachedData;
    void helperMethod();
};
```

### 3.9 `Q_PROPERTY` with All Attributes
Expose state as `Q_PROPERTY` with `READ`, `WRITE`, `NOTIFY`, and `RESET` as appropriate. This enables QML bindings, property animation, and reflection. Never add a write method without considering whether a `NOTIFY` signal is needed.

```cpp
Q_PROPERTY(int    progress  READ progress  WRITE setProgress  NOTIFY progressChanged)
Q_PROPERTY(bool   loading   READ isLoading                    NOTIFY loadingChanged)
Q_PROPERTY(Status status    READ status                       NOTIFY statusChanged  RESET resetStatus)
```

### 3.10 Understand Qt's Implicit Sharing (COW)
Qt containers and many Qt classes (`QString`, `QByteArray`, `QList`, etc.) use copy-on-write. Passing by value is often cheap (just a pointer copy + refcount increment). Avoid detaching implicitly by calling non-const methods unnecessarily.

```cpp
void process(QList<Item> list) {      // Cheap copy — shared data until modified
    const Item& first = list.first(); // Const access — no detach
    list.append(Item{});              // This detaches (modifies) — now a full copy
}
```

### 3.11 Use `Q_DECLARE_METATYPE` and `qRegisterMetaType` for Custom Types
Any custom type used in queued signals, `QVariant`, or `QSettings` must be registered.

```cpp
// In header
struct ConnectionInfo { QString host; int port; };
Q_DECLARE_METATYPE(ConnectionInfo)

// In main() or module init
qRegisterMetaType<ConnectionInfo>("ConnectionInfo");

// Now works across threads
emit connectionEstablished(info); // queued connection, safe cross-thread
```

### 3.12 Worker Object Pattern for Threading (Not `QThread::run()`)
The correct Qt threading model: create a worker QObject, move it to a QThread, and communicate via signals and slots. Do not subclass QThread and override `run()` unless you're managing a low-level event loop.

```cpp
class DataProcessor : public QObject {
    Q_OBJECT
public slots:
    void processData(const QByteArray& data) {
        // Runs in worker thread
        auto result = heavyComputation(data);
        emit processingComplete(result);
    }
signals:
    void processingComplete(const Result& result);
};

// Setup
auto* thread    = new QThread(this);
auto* processor = new DataProcessor; // No parent — will be moved to thread
processor->moveToThread(thread);
connect(thread, &QThread::finished, processor, &QObject::deleteLater);
thread->start();

// Cross-thread signal → auto-queued because processor is in another thread
connect(this, &MyClass::dataReady, processor, &DataProcessor::processData);
```

### 3.13 QMutexLocker and QReadWriteLock — Always RAII
Never lock a mutex manually without a RAII guard. Exceptions, early returns, or forgotten unlocks cause deadlocks.

```cpp
mutable QReadWriteLock m_lock;
QHash<int, User> m_users;

User findUser(int id) const {
    QReadLocker locker(&m_lock); // Released automatically at end of scope
    return m_users.value(id);
}

void updateUser(int id, const User& user) {
    QWriteLocker locker(&m_lock);
    m_users.insert(id, user);
}
```

### 3.14 Understand Qt Connection Types
Know exactly which connection type to use:
- `Qt::DirectConnection` — called immediately in emitter's thread (default for same-thread)
- `Qt::QueuedConnection` — call is posted to receiver's event loop (default for cross-thread)
- `Qt::BlockingQueuedConnection` — emitter blocks until receiver processes it (cross-thread, careful: deadlock risk)
- `Qt::UniqueConnection` — prevents duplicate connections

```cpp
// Cross-thread, non-blocking (queued is automatic, but being explicit is clear)
connect(source, &Source::dataReady,
        receiver, &Receiver::onDataReady,
        Qt::QueuedConnection);

// Prevent duplicate connections (e.g. in setup code called multiple times)
connect(btn, &QPushButton::clicked, this, &Widget::onClicked, Qt::UniqueConnection);
```

### 3.15 Proper QAbstractItemModel Implementation
When implementing custom models, always call the bookkeeping methods correctly. Forgetting these causes view corruption, crashes, and broken animations.

```cpp
void MyModel::appendRow(const Item& item) {
    const int newRow = m_items.size();
    beginInsertRows(QModelIndex(), newRow, newRow);
    m_items.append(item);
    endInsertRows();
}

void MyModel::removeRow(int row) {
    beginRemoveRows(QModelIndex(), row, row);
    m_items.removeAt(row);
    endRemoveRows();
}

void MyModel::clearAll() {
    beginResetModel();
    m_items.clear();
    endResetModel();
}
```

### 3.16 Custom Roles in Models
Define custom roles as an enum so role numbers are human-readable and refactorable.

```cpp
enum UserRole {
    NameRole   = Qt::UserRole + 1,
    EmailRole  = Qt::UserRole + 2,
    StatusRole = Qt::UserRole + 3,
};
Q_ENUM(UserRole)

QHash<int, QByteArray> roleNames() const override {
    return {
        {NameRole,   "name"},
        {EmailRole,  "email"},
        {StatusRole, "status"},
    };
}
```

### 3.17 QSortFilterProxyModel — Use It, Don't Modify the Source
When you need filtered or sorted views of a model, stack a `QSortFilterProxyModel` on top. Never modify your data model just to satisfy one view's sorting needs.

```cpp
m_proxyModel = new QSortFilterProxyModel(this);
m_proxyModel->setSourceModel(m_userModel);
m_proxyModel->setFilterCaseSensitivity(Qt::CaseInsensitive);
m_proxyModel->setFilterKeyColumn(UserModel::NameColumn);
listView->setModel(m_proxyModel);

// Filter live
connect(searchEdit, &QLineEdit::textChanged,
        m_proxyModel, &QSortFilterProxyModel::setFilterFixedString);
```

### 3.18 Use QLoggingCategory for Structured Logging
Category-based logging lets you turn on/off specific subsystems at runtime without recompiling.

```cpp
// network.h
Q_DECLARE_LOGGING_CATEGORY(lcNetwork)

// network.cpp
Q_LOGGING_CATEGORY(lcNetwork, "myapp.network", QtWarningMsg)

// usage
qCDebug(lcNetwork)   << "Connecting to" << host;
qCWarning(lcNetwork) << "Retry" << retryCount << "of" << maxRetries;
qCCritical(lcNetwork)<< "Connection failed:" << error;

// Runtime control via environment or config file:
// QT_LOGGING_RULES="myapp.network.debug=true"
```

### 3.19 QUndoStack for Reversible Operations
Implement undo/redo using the Command pattern via `QUndoCommand` and `QUndoStack`. Don't roll your own. Qt's implementation integrates with menu actions.

```cpp
class RenameCommand : public QUndoCommand {
public:
    RenameCommand(Item* item, const QString& newName)
        : m_item(item), m_oldName(item->name()), m_newName(newName) {
        setText(QStringLiteral("Rename to %1").arg(newName));
    }
    void redo() override { m_item->setName(m_newName); }
    void undo() override { m_item->setName(m_oldName); }
private:
    Item* m_item;
    QString m_oldName, m_newName;
};

// Usage
m_undoStack->push(new RenameCommand(selectedItem, newName));
```

### 3.20 Use Qt's Event Filter for Non-Intrusive Interception
Rather than subclassing a widget just to intercept events, install an event filter on it.

```cpp
// Install
lineEdit->installEventFilter(this);

// Handle
bool MyWidget::eventFilter(QObject* watched, QEvent* event) override {
    if (watched == lineEdit && event->type() == QEvent::KeyPress) {
        auto* ke = static_cast<QKeyEvent*>(event);
        if (ke->key() == Qt::Key_Return) {
            submitForm();
            return true; // consume the event
        }
    }
    return QWidget::eventFilter(watched, event);
}
```

### 3.21 Use QTimer::singleShot for Deferred Execution
For running something after the current event loop iteration without creating a timer object.

```cpp
// Defer UI update to next event loop tick (after all current events processed)
QTimer::singleShot(0, this, &MyWidget::refreshLayout);

// With lambda (C++11 overload, context-safe)
QTimer::singleShot(500, this, [this]() { m_statusBar->clearMessage(); });
```

### 3.22 QFuture and QPromise for Async Operations (Qt6)
Qt6's `QFuture<T>` and `QPromise<T>` provide proper async value passing. Use with `QtConcurrent::run` or manually.

```cpp
QFuture<QList<User>> UserRepository::loadAllAsync() {
    return QtConcurrent::run([this]() -> QList<User> {
        return fetchFromDatabase();
    });
}

// In UI layer — non-blocking
auto* watcher = new QFutureWatcher<QList<User>>(this);
connect(watcher, &QFutureWatcher<QList<User>>::finished, this, [this, watcher]() {
    m_users = watcher->result();
    watcher->deleteLater();
    refreshView();
});
watcher->setFuture(m_repo->loadAllAsync());
```

### 3.23 QSettings with a Typed Wrapper
Never scatter raw `QSettings` read/write throughout the code. Wrap it in a strongly typed settings class.

```cpp
class AppSettings {
public:
    static AppSettings& instance() {
        static AppSettings s;
        return s;
    }
    int windowWidth()  const { return m_settings.value(kWindowWidth, 1024).toInt(); }
    void setWindowWidth(int w) { m_settings.setValue(kWindowWidth, w); }
    bool darkMode() const { return m_settings.value(kDarkMode, false).toBool(); }
    void setDarkMode(bool v) { m_settings.setValue(kDarkMode, v); }
private:
    static constexpr auto kWindowWidth = "window/width";
    static constexpr auto kDarkMode    = "ui/darkMode";
    QSettings m_settings{"MyCompany", "MyApp"};
};
```

### 3.24 Q_GADGET for Value Types with Qt Meta Features
For data classes that don't need signals/slots but do need `Q_ENUM`, `Q_PROPERTY`, or QML exposure, use `Q_GADGET` instead of `Q_OBJECT`. No overhead of QObject's virtual table or threading.

```cpp
class Point {
    Q_GADGET
    Q_PROPERTY(double x MEMBER m_x)
    Q_PROPERTY(double y MEMBER m_y)
public:
    double m_x = 0.0;
    double m_y = 0.0;
};
Q_DECLARE_METATYPE(Point)
```

### 3.25 Use Qt's Resource System for All Bundled Assets
Never hard-code file paths for bundled assets. Use `.qrc` files and `:/<path>` URIs. This ensures assets work correctly on all platforms and in installed applications.

```cpp
// In .qrc file
// <file>images/logo.png</file>

// In code
QPixmap logo(":/images/logo.png");
QFile styleFile(":/styles/dark.qss");
```

### 3.26 `QMetaObject::invokeMethod` for Cross-Thread Method Calls
A safe way to call a method on an object in another thread without explicit signal-slot wiring.

```cpp
// Qt::QueuedConnection ensures it runs in the target object's thread
QMetaObject::invokeMethod(m_worker, "processData",
                          Qt::QueuedConnection,
                          Q_ARG(QByteArray, data));
```

### 3.27 Internationalization from Day One
Wrap every user-visible string in `tr()`. Define `TRANSLATION_DOMAIN`. Use `QTranslator`. Set up `.ts` / `.qm` workflow.

```cpp
// BAD
setTitle("File not found");

// GOOD
setTitle(tr("File not found"));
setToolTip(tr("Click to retry — %1 errors remaining").arg(retries));
```

### 3.28 Prefer QHash Over QMap When Order Doesn't Matter
`QHash` is O(1) average lookup; `QMap` is O(log n). If you don't need ordered iteration, always prefer `QHash`.

```cpp
QHash<QString, QWidget*> m_widgetByName;  // O(1) lookup
QMap<QString, QWidget*> m_ordered;         // Only when sorted order needed
```

### 3.29 Use Qt6's `QList` as the Universal List Container
In Qt6, `QList<T>` is equivalent to `QVector<T>` (contiguous storage). `QVector` is now a `QList` alias. Use `QList<T>` everywhere.

### 3.30 Explicit `Q_UNUSED` for Intentionally Unused Parameters
```cpp
void MyWidget::resizeEvent(QResizeEvent* event) override {
    Q_UNUSED(event) // Documents intentional non-use; suppresses warning
    rebuildLayout();
}
```

---

## 4. MEMORY MANAGEMENT

### 4.1 Prefer Stack Allocation Over Heap
Every `new` is a potential leak. Stack objects are automatically destroyed. For QObjects, create them on the stack when lifetime is clear.

```cpp
// Dialog shown modally — stack allocation is perfect
QMessageBox msgBox(this);
msgBox.setText(tr("Are you sure?"));
if (msgBox.exec() == QMessageBox::Yes) { ... }
// msgBox automatically destroyed at end of scope
```

### 4.2 `std::unique_ptr` for Exclusive Ownership
The single most important smart pointer. Zero overhead, expresses sole ownership.

```cpp
class Application {
    std::unique_ptr<Database>    m_db;
    std::unique_ptr<HttpServer>  m_server;
    std::unique_ptr<Config>      m_config;
    // All automatically cleaned up in destructor — no explicit delete needed
};
```

### 4.3 `std::shared_ptr` Only When Truly Shared
Shared ownership has overhead (control block allocation, atomic refcount). Only use it when multiple owners genuinely exist with overlapping lifetimes.

```cpp
// Shared resource used by multiple components with independent lifetimes
auto sharedConfig = std::make_shared<Config>(configFile);
m_server->setConfig(sharedConfig);
m_logger->setConfig(sharedConfig);
```

### 4.4 `std::weak_ptr` to Break Cycles
When `A` holds `shared_ptr<B>` and `B` holds `shared_ptr<A>`, nothing is ever freed. `weak_ptr` breaks cycles — observe without owning.

```cpp
class Node {
    std::shared_ptr<Node> m_child;
    std::weak_ptr<Node>   m_parent; // Weak to prevent cycle
};
```

### 4.5 Never Use Raw `new`/`delete` in Application Code
Raw `new`/`delete` is the single biggest source of memory leaks and double-free bugs. The only acceptable `new` is inside a smart pointer or Qt parent-child hierarchy.

```cpp
// BAD — if anything between new and delete throws, this leaks
auto* obj = new HeavyObject();
doSomethingThatMightThrow();
delete obj;

// GOOD
auto obj = std::make_unique<HeavyObject>();
doSomethingThatMightThrow();
// Automatically freed
```

### 4.6 Use `std::make_unique` and `std::make_shared`
Never write `std::unique_ptr<T>(new T(...))`. Use `make_unique`/`make_shared` — they're exception-safe and avoid double-allocation in the shared_ptr case.

```cpp
auto conn   = std::make_unique<DatabaseConnection>(host, port);
auto config = std::make_shared<Config>(configFile);
```

### 4.7 Custom Deleters for Non-Standard Resources
For resources that aren't deleted with `delete` (file handles, C library resources, GPU buffers), use smart pointers with custom deleters.

```cpp
auto rawHandle = std::unique_ptr<FILE, decltype(&fclose)>(
    fopen(path.toLocal8Bit(), "rb"), &fclose);

auto glBuffer = std::unique_ptr<GLuint, decltype(&glDeleteBuffers)>(
    new GLuint, [](GLuint* id) { glDeleteBuffers(1, id); delete id; });
```

### 4.8 Object Pools for High-Frequency Allocation
For objects that are frequently created and destroyed (e.g., network packets, render commands), maintain a pool to reuse memory.

```cpp
template<typename T>
class ObjectPool {
public:
    T* acquire() {
        if (!m_pool.empty()) {
            auto* obj = m_pool.back().release();
            m_pool.pop_back();
            return obj;
        }
        return new T();
    }
    void release(T* obj) {
        obj->reset(); // Clear state before returning to pool
        m_pool.emplace_back(obj);
    }
private:
    std::vector<std::unique_ptr<T>> m_pool;
};
```

---

## 5. SIGNAL & SLOT BEST PRACTICES

### 5.1 Document Every Signal and Slot
Every `signals:` and `slots:` entry deserves a comment explaining when it's emitted, what the parameters mean, and any invariants.

```cpp
signals:
    /// Emitted when authentication succeeds.
    /// @param token  Valid JWT token, non-empty, valid for 24h.
    void authenticated(const QString& token);

    /// Emitted when login fails for any reason.
    /// @param code   One of ErrorCode::InvalidCredentials, NetworkError, etc.
    /// @param message Human-readable description suitable for display.
    void authFailed(ErrorCode code, const QString& message);
```

### 5.2 Store Connections When You Need to Disconnect
`connect()` returns a `QMetaObject::Connection`. Store it if you need to disconnect selectively.

```cpp
m_networkConnection = connect(m_networkManager, &QNetworkAccessManager::finished,
                              this, &MyClass::onRequestFinished);

// Later:
disconnect(m_networkConnection);
```

### 5.3 Never Emit Signals from Constructors
The object isn't fully constructed. Any connected slot that calls back into the object may find it in an inconsistent state. Defer initial signal emission to a `initialize()` method or use `QTimer::singleShot(0, ...)`.

### 5.4 Avoid Signal-Signal Chains That Are Hard to Follow
Deep signal chains (A emits → B connects to → C emits → D connects to...) are debugging nightmares. Prefer explicit method calls for intra-object flow. Reserve signals for inter-object communication.

### 5.5 Use `Qt::UniqueConnection` in Setup Code Called Multiple Times
If your connection setup code might be called more than once (e.g., in `polish()`, `showEvent()`), protect against duplicate connections.

```cpp
connect(source, &Source::changed, this, &Widget::update, Qt::UniqueConnection);
```

### 5.6 Disconnect All Connections When Replacing Objects
When you replace a model, data source, or any object you've connected to, disconnect from the old one explicitly before connecting to the new one. Or use a sentinel `QObject` that you replace.

```cpp
void setModel(UserModel* newModel) {
    if (m_model) disconnect(m_model, nullptr, this, nullptr);
    m_model = newModel;
    if (m_model) {
        connect(m_model, &UserModel::dataChanged, this, &View::onDataChanged);
        connect(m_model, &UserModel::rowsInserted, this, &View::onRowsInserted);
    }
}
```

---

## 6. THREADING & CONCURRENCY

### 6.1 Design Objects as Thread-Affine by Default
Every QObject has a thread affinity (the thread it lives in). By default, it's the thread that created it. Design your objects to be single-threaded and communicate across threads only via signals/slots (queued connections).

### 6.2 `std::atomic<T>` for Lock-Free Flags
For simple boolean/integer flags accessed from multiple threads, `std::atomic` avoids mutex overhead.

```cpp
std::atomic<bool> m_cancelled{false};
std::atomic<int>  m_processedCount{0};

void cancel()        { m_cancelled.store(true, std::memory_order_relaxed); }
bool isCancelled()   { return m_cancelled.load(std::memory_order_relaxed); }
void recordItem()    { m_processedCount.fetch_add(1, std::memory_order_relaxed); }
```

### 6.3 Understand Memory Ordering
Don't blindly use `std::memory_order_seq_cst` everywhere. Use the weakest ordering that's correct:
- `relaxed` — independent counters
- `release`/`acquire` — producer/consumer handoff
- `seq_cst` — only when you need total global ordering

### 6.4 Thread Sanitizer in CI
Always run ThreadSanitizer (`-fsanitize=thread`) in your test/CI pipeline. It catches data races that manual review misses.

### 6.5 Never Call Qt GUI Methods from Non-Main Threads
All `QWidget`, `QPainter`, and most GUI classes are not thread-safe. Always update UI from the main thread. Use signals to marshal results back.

```cpp
// Worker thread
emit resultsReady(data); // Queued connection → runs in main thread

// Main thread slot
void MainWindow::onResultsReady(const Results& data) {
    m_view->updateWith(data); // Safe — we're in the main thread
}
```

### 6.6 QtConcurrent::run for Fire-and-Forget Tasks
For simple background tasks that don't need a QObject, `QtConcurrent::run` is simpler than creating a thread.

```cpp
QFuture<void> future = QtConcurrent::run([path, data]() {
    QFile file(path);
    if (file.open(QIODevice::WriteOnly)) file.write(data);
});
```

### 6.7 Avoid Blocking the Main Thread — Ever
The main thread must remain responsive. Any operation that can take more than a few milliseconds (file I/O, network, database, heavy computation) must run asynchronously. A frozen UI is a bug, not an inconvenience.

---

## 7. PERFORMANCE & EFFICIENCY

### 7.1 Profile Before You Optimize
Use Qt Creator's built-in profiler (Valgrind/callgrind integration) or Linux perf, or VTune. Optimizing un-profiled code produces micro-optimized bottlenecks that don't matter.

### 7.2 Batch Model Notifications
When updating many rows at once, use `beginResetModel()` / `endResetModel()` or emit `dataChanged()` with a range, not one signal per row.

```cpp
// BAD — N signals for N items
for (auto& item : items) {
    m_data.append(item);
    int row = m_data.size() - 1;
    emit dataChanged(index(row), index(row));
}

// GOOD — one signal, one UI update
beginInsertRows(QModelIndex(), m_data.size(), m_data.size() + items.size() - 1);
m_data.append(items);
endInsertRows();
```

### 7.3 QStaticText for Repeated Static Text Rendering
For text rendered repeatedly that doesn't change (labels, static captions), use `QStaticText`. It pre-renders the text layout.

```cpp
class ScoreDisplay : public QWidget {
    QStaticText m_scoreLabel{QStringLiteral("Score:")};
    void paintEvent(QPaintEvent*) override {
        QPainter p(this);
        p.drawStaticText(0, 0, m_scoreLabel); // Fast — layout pre-computed
    }
};
```

### 7.4 Avoid `QStringBuilder` / Implicit Conversions in Hot Paths
In tight loops, every `+` on `QString` is a potential allocation. Use `QStringBuilder` with `%` operator or `QString::append`.

```cpp
// BAD in a tight loop — multiple allocations
QString result = "Hello " + firstName + " " + lastName + "!";

// GOOD — one allocation using QStringBuilder
QString result = QStringLiteral("Hello ")
    % firstName % QLatin1Char(' ') % lastName % QLatin1Char('!');
```

### 7.5 Use `QHash` with a Good Hash Function
The default hash is good for built-in types. For custom types, provide a fast, well-distributed `qHash` overload.

```cpp
struct UserId { int value; };
inline size_t qHash(const UserId& id, size_t seed = 0) {
    return qHash(id.value, seed);
}
```

### 7.6 Prefer Value Semantics for Small Types
Pass small, trivially copyable types by value, not by const reference. The overhead of the indirection and cache miss for the pointer is worse than copying 8–16 bytes.

```cpp
void draw(QPoint position, QColor color);      // By value — fits in registers
void load(const Config& config);               // By ref — Config is large
```

### 7.7 Data-Oriented Design (DOD) for High-Throughput Processing
Instead of Array of Structs (AoS), use Struct of Arrays (SoA) when processing large collections. This maximizes cache efficiency.

```cpp
// AoS — poor cache use when iterating one field
struct Entity { float x, y, z; int health; QString name; };
std::vector<Entity> entities;

// SoA — process all positions without loading health/name into cache
struct EntityList {
    std::vector<float>   x, y, z;
    std::vector<int>     health;
    std::vector<QString> name;
};
```

### 7.8 Lazy Initialization
Don't initialize expensive resources in constructors. Initialize on first use with a flag or `std::optional`.

```cpp
class DocumentCache {
    mutable std::optional<LargeIndex> m_index;
public:
    const LargeIndex& index() const {
        if (!m_index) m_index = buildIndex();
        return *m_index;
    }
};
```

### 7.9 Avoid Dynamic Dispatch in Hot Loops
Virtual function calls prevent inlining and add indirect branch prediction pressure. In loops running millions of iterations, use CRTP, function pointers, or `std::function` stored once outside the loop.

### 7.10 Link-Time Optimization (LTO)
Enable LTO (`-flto`) in release builds. It allows the linker to inline across translation unit boundaries and dramatically improve cross-module call performance.

```cmake
set_target_properties(MyApp PROPERTIES INTERPROCEDURAL_OPTIMIZATION TRUE)
```

### 7.11 Use `QElapsedTimer` for Micro-Benchmarking During Development
```cpp
QElapsedTimer timer;
timer.start();
heavyOperation();
qDebug() << "heavyOperation took" << timer.elapsed() << "ms";
```

---

## 8. ERROR HANDLING & ROBUSTNESS

### 8.1 Assertions for Invariants (`Q_ASSERT`, `Q_ASSERT_X`)
Use assertions to enforce invariants that should never be violated in correct code. They're compiled out in release mode. Don't use them for input validation.

```cpp
void setPage(int page) {
    Q_ASSERT_X(page >= 0 && page < m_pageCount,
               "Document::setPage",
               "Page index out of bounds");
    m_currentPage = page;
}
```

### 8.2 Validate All External Input
Data from files, network, databases, or user input is untrusted. Validate it before using it. Return errors, don't assert.

```cpp
std::optional<Config> parseConfig(const QByteArray& json) {
    QJsonParseError error;
    QJsonDocument doc = QJsonDocument::fromJson(json, &error);
    if (doc.isNull()) {
        qCWarning(lcConfig) << "Failed to parse config:" << error.errorString();
        return std::nullopt;
    }
    if (!doc.object().contains("version")) {
        qCWarning(lcConfig) << "Config missing required 'version' field";
        return std::nullopt;
    }
    return buildConfig(doc.object());
}
```

### 8.3 Exception Safety Levels — Know What You're Guaranteeing
Document which guarantee your functions provide:
- **No-throw**: Function never throws. Mark with `noexcept`.
- **Strong**: On failure, program state is unchanged (rollback).
- **Basic**: On failure, no resources are leaked, invariants are intact.

```cpp
// Strong guarantee — uses copy-and-swap
void Database::updateUser(const User& user) {
    auto copy = m_users; // Make a copy
    copy[user.id()] = user; // Modify the copy
    std::swap(m_users, copy); // Swap — noexcept, can't fail
}
```

### 8.4 Static Analysis in Your Build
Run `clang-tidy` and `cppcheck` as part of CI. Enable `Qt` checks in clang-tidy for Qt-specific antipatterns.

```cmake
set(CMAKE_CXX_CLANG_TIDY
    clang-tidy
    -checks=bugprone-*,modernize-*,performance-*,readability-*,qt-*
    -warnings-as-errors=*
)
```

### 8.5 AddressSanitizer, UBSanitizer, ThreadSanitizer
Run sanitized debug builds regularly. Catches buffer overflows, use-after-free, undefined behavior, and data races that only manifest at runtime.

```cmake
# Debug sanitizer build
target_compile_options(MyApp PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer)
target_link_options(MyApp PRIVATE -fsanitize=address,undefined)
```

### 8.6 Defensive Null Checks — But Not Everywhere
Check pointers where nullptr is a legitimate possibility. Don't check where nullptr would represent a programmer error (use `Q_ASSERT` there instead).

```cpp
void Widget::setModel(AbstractModel* model) {
    // nullptr is a valid input — clear the model
    if (m_model) disconnect(m_model, nullptr, this, nullptr);
    m_model = model;
    if (m_model) connect(m_model, &AbstractModel::dataChanged, this, &Widget::refresh);
    refresh();
}
```

### 8.7 RAII for All Resources
Every resource — file handles, database transactions, locks, temporary files, OpenGL state — must be managed with RAII.

```cpp
class DatabaseTransaction {
public:
    explicit DatabaseTransaction(QSqlDatabase& db) : m_db(db) {
        m_db.transaction();
    }
    ~DatabaseTransaction() {
        if (!m_committed) m_db.rollback();
    }
    void commit() { m_db.commit(); m_committed = true; }
private:
    QSqlDatabase& m_db;
    bool m_committed = false;
};
```

### 8.8 Error Propagation Pattern with Result Types
For functions deep in the call stack, propagate errors without exceptions using a result type.

```cpp
template<typename T>
class Result {
public:
    static Result ok(T value)           { return Result{std::move(value), {}}; }
    static Result fail(QString error)   { return Result{{}, std::move(error)}; }
    bool isOk()   const { return m_error.isEmpty(); }
    T&   value()        { Q_ASSERT(isOk()); return *m_value; }
    const QString& error() const { return m_error; }
private:
    std::optional<T> m_value;
    QString          m_error;
};
```

---

## 9. API DESIGN & REUSABILITY

### 9.1 SOLID Principles — All Five, All the Time

**Single Responsibility**: One class, one job. A `FileParser` parses files. It doesn't display UI, emit network requests, or log to a database.

**Open/Closed**: Design for extension without modification. Use virtual methods, strategies, or templates so new behavior can be added without editing existing code.

**Liskov Substitution**: Every subclass must be substitutable for its base class without breaking correctness. Never override to throw an exception where the base didn't.

**Interface Segregation**: Don't force clients to depend on methods they don't use. Prefer many small interfaces over one large one.

**Dependency Inversion**: Depend on abstractions (interfaces/base classes), not concrete implementations. Inject dependencies.

### 9.2 Dependency Injection Everywhere
Never `new` your dependencies inside a class. Accept them via constructor or setter injection. This makes code testable and replaceable.

```cpp
// BAD — hardwired to concrete type, untestable
class UserService {
    UserService() : m_db(new PostgresDatabase()) {}
};

// GOOD — depends on abstraction, injectable in tests
class UserService {
public:
    explicit UserService(IDatabase* db, ILogger* logger)
        : m_db(db), m_logger(logger) {}
private:
    IDatabase* m_db;
    ILogger*   m_logger;
};
```

### 9.3 Interface Classes with Pure Virtual Methods
Define behavior contracts as abstract base classes. Callers depend on the interface; implementations can be swapped.

```cpp
class IUserRepository {
public:
    virtual ~IUserRepository() = default;
    [[nodiscard]] virtual std::optional<User> findById(int id) const = 0;
    virtual void save(const User& user) = 0;
    virtual void remove(int id) = 0;
};

class SqlUserRepository  : public IUserRepository { ... };
class InMemoryRepository : public IUserRepository { ... }; // For tests
```

### 9.4 Factory Pattern for Complex Object Creation
When creating an object requires significant configuration or multiple steps, use a factory function or factory class.

```cpp
class WidgetFactory {
public:
    static QWidget* createFor(const DataModel& model, Theme theme) {
        switch (model.type()) {
        case ModelType::Table:  return new TableWidget(model, theme);
        case ModelType::Chart:  return new ChartWidget(model, theme);
        case ModelType::Tree:   return new TreeWidget(model, theme);
        default: Q_UNREACHABLE();
        }
    }
};
```

### 9.5 Strategy Pattern for Interchangeable Algorithms
Inject algorithms as objects or functions rather than hardcoding them.

```cpp
class Exporter {
public:
    using FormatStrategy = std::function<QByteArray(const Document&)>;
    void setStrategy(FormatStrategy strategy) { m_strategy = std::move(strategy); }
    QByteArray exportDocument(const Document& doc) { return m_strategy(doc); }
private:
    FormatStrategy m_strategy;
};

exporter.setStrategy(PdfExporter{});
exporter.setStrategy(HtmlExporter{compression: Compression::Gzip});
```

### 9.6 Template Method Pattern for Customizable Pipelines
Define the skeleton of an algorithm in a base class, with steps overridden by subclasses.

```cpp
class DataProcessor {
public:
    void process(const QByteArray& data) {
        auto parsed   = parse(data);       // pure virtual — overridden by subclass
        auto filtered = filter(parsed);    // has default impl
        auto result   = transform(filtered);
        emit completed(result);
    }
protected:
    virtual ParsedData parse(const QByteArray&) = 0;
    virtual ParsedData filter(ParsedData data)  { return data; } // Default: pass-through
    virtual Result     transform(ParsedData)    = 0;
signals:
    void completed(const Result&);
};
```

### 9.7 Fluent Builder Pattern for Complex Configuration
For objects with many optional configuration parameters.

```cpp
class RequestBuilder {
public:
    RequestBuilder& url(const QUrl& url)            { m_url = url;      return *this; }
    RequestBuilder& header(const QString& k, const QString& v) { m_headers[k]=v; return *this; }
    RequestBuilder& timeout(int ms)                 { m_timeout = ms;   return *this; }
    RequestBuilder& retry(int count)                { m_retries = count; return *this; }
    [[nodiscard]] NetworkRequest build() const      { return {m_url, m_headers, m_timeout, m_retries}; }
};

auto req = RequestBuilder{}
    .url(QUrl{"https://api.example.com/users"})
    .header("Authorization", "Bearer " + token)
    .timeout(5000)
    .retry(3)
    .build();
```

### 9.8 Minimal Public API Surface
Expose only what consumers genuinely need. Everything else is `private`. Adding to a public API is easy; removing is a breaking change. Start minimal.

### 9.9 Prefer Value Types Where Possible
Not everything needs to be a QObject on the heap. Plain structs and value classes are simpler, faster, and stack-allocatable.

```cpp
// This doesn't need Q_OBJECT, QObject, or heap allocation
struct Coordinate { double latitude; double longitude; };
struct DateRange  { QDate from; QDate to; };
struct Color      { uint8_t r, g, b, a; };
```

### 9.10 Design for Testability From Day Zero
If a class is hard to unit test, its design is wrong. Difficult-to-test code usually has too many dependencies, too much private state, or mixed concerns.

---

## 10. CODE STYLE & READABILITY

### 10.1 Single Exit Point Rule — Sometimes
Avoid deeply nested early returns when the function is complex, but use early returns to reduce nesting for guard clauses. The goal is readability.

```cpp
// Guard clauses — early return is cleaner
QString processFile(const QString& path) {
    if (path.isEmpty())    return {};
    if (!QFileInfo::exists(path)) { logError("File not found"); return {}; }
    // ... actual logic follows with no extra indentation
}
```

### 10.2 Name Things for What They Are, Not How They Work
Names should describe purpose, not implementation. `m_userList` not `m_qlistUsers`. `fetchUserById()` not `doDbQueryForUser()`.

### 10.3 Boolean Parameter Smell
A boolean parameter usually means the function does two things. Split it.

```cpp
// BAD
void render(bool fast);

// GOOD
void renderFast();
void renderHighQuality();

// Or use a descriptive enum
void render(RenderMode mode);
```

### 10.4 Magic Numbers Are Banned
Every magic number gets a named `constexpr` constant.

```cpp
// BAD
if (retries > 3) { ... }
QTimer::singleShot(500, this, slot);

// GOOD
inline constexpr int    kMaxRetries        = 3;
inline constexpr int    kStatusClearDelayMs = 500;
if (retries > kMaxRetries) { ... }
QTimer::singleShot(kStatusClearDelayMs, this, slot);
```

### 10.5 Consistent Naming Conventions — Pick One and Enforce It

```cpp
// Members
int m_pageCount;
QString m_userName;

// Constants
inline constexpr int kMaxItems = 100;
static constexpr int kDefaultTimeout = 5000;

// Signals — describe the event in past tense
signals:
    void userLoggedIn(const User& user);
    void connectionLost();

// Slots — describe the response action
private slots:
    void handleUserLogin(const User& user);
    void onConnectionLost();

// Booleans — readable as a sentence
bool m_isLoading    = false;
bool m_hasUnsaved   = false;
bool isEmpty() const;
bool canSubmit() const;
```

### 10.6 Avoid Deep Nesting (Max 2–3 Levels)
Deeply nested code is a sign of mixed concerns. Extract methods, use early returns, or restructure.

### 10.7 Functions Should Do One Thing
If you need "and" to describe what a function does, it does too much.

### 10.8 Keep Functions Short
A function that doesn't fit on one screen has too many concerns. Aim for functions you can read in their entirety at a glance.

### 10.9 Self-Documenting Code Over Comments
Name things so clearly that comments are rarely needed. Comments should explain *why*, not *what*.

```cpp
// BAD — comment restates the code
// Increment the counter
m_count++;

// GOOD — comment explains intent/why
// We delay processing by one tick to let the current event batch complete
// before we update the view, preventing partial-state renders.
QTimer::singleShot(0, this, &View::refreshAll);
```

### 10.10 Use `auto` Judiciously
Use `auto` when the type is obvious from context or too verbose to write. Don't use it when it hides important type information.

```cpp
auto it    = m_map.find(key);          // OK — iterator type is verbose
auto conn  = connect(src, sig, dst, slot); // OK — QMetaObject::Connection is clear
auto count = getItemCount();           // BAD — hides whether it's int, size_t, qsizetype
int  count = getItemCount();           // GOOD
```

---

## 11. BUILD SYSTEM & TOOLING

### 11.1 CMake — Not qmake
CMake is the modern, actively developed standard. qmake is in maintenance mode. Use CMake with Qt6's `find_package(Qt6 COMPONENTS ...)` integration.

```cmake
cmake_minimum_required(VERSION 3.21)
project(MyApp VERSION 2.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Widgets Network Sql)
```

### 11.2 Separate Debug and Release Builds
Debug: full symbols, no optimization, sanitizers enabled. Release: O2/O3, LTO, no assertions. RelWithDebInfo: optimized with debug symbols for profiling.

### 11.3 Maximum Warning Level — Treat as Errors
```cmake
target_compile_options(MyApp PRIVATE
    $<$<CXX_COMPILER_ID:GNU,Clang>:
        -Wall -Wextra -Wpedantic -Wshadow -Wconversion
        -Wnull-dereference -Wdouble-promotion
        -Werror>
    $<$<CXX_COMPILER_ID:MSVC>:/W4 /WX>
)
```

### 11.4 CI/CD Pipeline for Every Commit
Build and test on every push. Minimum: Linux GCC + Clang, Windows MSVC, macOS Clang. Run unit tests, static analysis, and sanitizer builds.

### 11.5 Dependency Management with Conan or vcpkg
Don't vendor third-party libraries manually. Use Conan2 or vcpkg for reproducible dependency resolution.

### 11.6 `clang-format` Enforced in CI
No debates about formatting. `.clang-format` config in the repo, CI rejects code that isn't formatted.

```yaml
# In CI
- run: clang-format --dry-run --Werror $(find . -name '*.cpp' -o -name '*.h')
```

### 11.7 Semantic Versioning for Libraries
Follow SemVer (MAJOR.MINOR.PATCH). Breaking API change → bump major. New feature → minor. Bug fix → patch. Document this in your CHANGELOG.

### 11.8 Separate Public and Private Headers
Headers under `include/<LibName>/` are the public API (shipped to consumers). Headers under `src/` are private. Never leak private headers.

---

## 12. TESTING

### 12.1 Test-Driven Development for Core Logic
Write the test first. It forces you to design a testable API. It also means your unit tests cover 100% of the logic by construction.

### 12.2 Qt Test Framework for Qt Code
Use `QTest` for testing Qt code — it integrates with signals, models, and the event loop.

```cpp
class UserModelTest : public QObject {
    Q_OBJECT
private slots:
    void testInsertRow_emitsRowsInserted();
    void testRemoveRow_updatesCount();
    void testFilterByName_returnMatchingUsers();
};

void UserModelTest::testInsertRow_emitsRowsInserted() {
    UserModel model;
    QSignalSpy spy(&model, &UserModel::rowsInserted);
    model.append(User{1, "Alice"});
    QCOMPARE(spy.count(), 1);
    QCOMPARE(model.rowCount(), 1);
}
QTEST_MAIN(UserModelTest)
```

### 12.3 `QSignalSpy` to Test Signal Emissions
```cpp
QSignalSpy spy(service, &AuthService::loginFailed);
service->login("bad@email.com", "wrongpassword");
QCOMPARE(spy.count(), 1);
QCOMPARE(spy.at(0).at(0).value<ErrorCode>(), ErrorCode::InvalidCredentials);
```

### 12.4 Mock Objects for Dependency Isolation
Use an in-memory implementation of your interfaces for testing, or a mocking framework like GoogleMock.

```cpp
class MockUserRepository : public IUserRepository {
public:
    std::optional<User> findById(int id) const override {
        auto it = m_data.find(id);
        return it != m_data.end() ? std::make_optional(it->second) : std::nullopt;
    }
    void save(const User& user) override { m_data[user.id()] = user; }
    void remove(int id) override { m_data.erase(id); }
    std::map<int, User> m_data; // Inspectable in tests
};
```

### 12.5 Test Edge Cases and Boundaries
Empty containers, null pointers, maximum values, Unicode strings, empty strings, single-element lists, concurrent access.

### 12.6 Property-Based Testing
Test with randomly generated inputs, not just handpicked examples. Libraries like rapidcheck work with C++.

### 12.7 Fuzz Testing for Input Parsers
Any code that parses external data (JSON, XML, binary protocols) should be fuzz-tested.

### 12.8 Test Code Is Production Code
Apply the same quality standards to tests: readable names, no magic numbers, no duplication, single assertion per test, meaningful error messages in QCOMPARE.

### 12.9 `QCOMPARE_EQ` With Custom Error Messages (Qt6.3+)
```cpp
QCOMPARE_EQ(model.rowCount(), 5);
QCOMPARE_EQ(user.name(), QStringLiteral("Alice"));
```

---

## 13. DOCUMENTATION

### 13.1 Doxygen for All Public APIs
Every public class, public method, and public signal gets a Doxygen comment with `\brief`, `\param`, `\return`, `\note`, and `\since`.

```cpp
/**
 * \brief Authenticates the user with the given credentials.
 *
 * Performs authentication asynchronously. On success, emits \c authenticated().
 * On failure, emits \c authFailed() with the specific error code.
 *
 * \param email    The user's email address. Must be a valid email format.
 * \param password Plaintext password. Hashed client-side before transmission.
 *
 * \note This method is thread-safe and can be called from any thread.
 * \since 2.0
 */
void login(const QString& email, const QString& password);
```

### 13.2 Architecture Decision Records (ADRs)
For every major design decision, write an ADR: context, decision, consequences. Future maintainers (including yourself in 18 months) will thank you.

### 13.3 README with Build Instructions
Every project needs a README covering: purpose, dependencies, build steps, test steps, and basic usage.

### 13.4 CHANGELOG
Document every change in a `CHANGELOG.md` following Keep a Changelog format. Tag releases in git.

### 13.5 Inline TODO/FIXME with Tracking
Never leave `// TODO` without a ticket number or assignee. Otherwise they accumulate and rot.

```cpp
// TODO(MYAPP-1234): Replace with async API when server supports it (target: v3.0)
```

---

## 14. QML + C++ INTEGRATION (For QML-Based Apps)

### 14.1 Expose C++ to QML via `QML_ELEMENT` or `qmlRegisterType`
In Qt6, prefer `QML_ELEMENT` macro in your header — it's cleaner and compile-time checked.

```cpp
class UserViewModel : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QString name READ name NOTIFY nameChanged)
    // ...
};
```

### 14.2 Never Put Business Logic in QML
QML is for presentation only. All logic, validation, and data manipulation belongs in C++ ViewModels. QML binds to properties and calls invokable methods.

```cpp
// In C++
Q_INVOKABLE void submitForm();
Q_INVOKABLE bool validateEmail(const QString& email) const;

// In QML
Button { onClicked: viewModel.submitForm() }
```

### 14.3 Use `QML_SINGLETON` for App-Wide Services

```cpp
class AppController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    // ...
};
// In QML: AppController.currentUser.name
```

### 14.4 Avoid Expensive Operations in QML Property Bindings
Every binding re-evaluates when any dependency changes. A binding that calls a C++ function doing significant work will hammer performance.

### 14.5 Use `WorkerScript` in QML for Background Tasks
For tasks that can be expressed in JS and don't need C++, `WorkerScript` keeps the QML thread responsive.

---

## 15. SECURITY

### 15.1 Sanitize All SQL — Use Bound Parameters
Never concatenate user input into SQL strings. Always use `QSqlQuery::prepare` with bound parameters.

```cpp
// NEVER — SQL injection vulnerability
QString q = "SELECT * FROM users WHERE name = '" + input + "'";

// ALWAYS
QSqlQuery query;
query.prepare("SELECT * FROM users WHERE name = :name");
query.bindValue(":name", input);
query.exec();
```

### 15.2 Validate and Sanitize HTML/Web Content
If displaying any user-generated content in `QTextBrowser` or QML WebView, sanitize it or render it as plain text.

### 15.3 Secure Network Connections
Always use SSL/TLS. Use `QSslConfiguration` to configure certificate validation. Never disable certificate verification in production.

```cpp
QSslConfiguration sslConfig = QSslConfiguration::defaultConfiguration();
sslConfig.setProtocol(QSsl::TlsV1_3);
request.setSslConfiguration(sslConfig);
```

### 15.4 Don't Store Secrets in Code
No API keys, passwords, or private keys in source files. Use environment variables, `QKeychain`, or a secrets manager at runtime.

### 15.5 Use `QCryptographicHash` and `QMessageAuthenticationCode`
For hashing and HMAC, use Qt's wrappers rather than rolling your own.

---

## SUMMARY QUICK REFERENCE

| Category | Key Principle |
|---|---|
| Architecture | Layered, decoupled, MVVM, PIMPL |
| C++ Language | Modern C++17/20, RAII, Rule of Zero, noexcept |
| Qt Core | New-style connect, QStringLiteral, parent ownership |
| Memory | No raw new/delete, smart pointers, QPointer |
| Threading | Worker objects, RAII locks, no GUI on non-main thread |
| Performance | Profile first, batch updates, avoid string copies |
| Error Handling | Assertions + validation, Result types, sanitizers |
| API Design | SOLID, DI, interfaces, minimal surface |
| Readability | Naming, no magic numbers, short functions |
| Testing | TDD, mocks, QSignalSpy, edge cases |
| Tooling | CMake, clang-format, clang-tidy, CI/CD |
| Documentation | Doxygen, ADRs, CHANGELOG |
| Security | Parameterized SQL, TLS, no hardcoded secrets |
