cmake_minimum_required(VERSION 3.16)

project(HyperLinkNotes VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Qml Quick Svg Network)
qt_policy(SET QTP0001 NEW)

# Windows: embed the app icon (shown in Explorer, taskbar, shortcuts). windres
# resolves "appicon.ico" relative to this .rc file, so both live in packaging/.
if(WIN32)
    set(APP_ICON_RC "${CMAKE_CURRENT_SOURCE_DIR}/packaging/app_icon.rc")
    # windres' preprocessor mangles -I include paths that contain spaces (this
    # project lives under "CODING PROJECTS"). The icon RC needs no include dirs,
    # so drop <INCLUDES> from the RC compile command entirely.
    set(CMAKE_RC_COMPILE_OBJECT
        "<CMAKE_RC_COMPILER> <DEFINES> <FLAGS> -O coff <SOURCE> <OBJECT>")
endif()

# ── C++ sources (all under src/) ────────────────────────────────────────────
qt_add_executable(appHyperLinkNotes
    main.cpp
    ${APP_ICON_RC}

    # Core — vault model + QML view-model
    src/core/VaultRepository.cpp
    src/core/VaultRepository.h
    src/core/VaultViewModel.cpp
    src/core/VaultViewModel.h

    # Vault — file-system operations
    src/vault/ScanDirectory.cpp
    src/vault/CreateFolder.cpp
    src/vault/CreateNote.cpp
    src/vault/IsFileNameAvailable.cpp
    src/vault/RenameFile.cpp
    src/vault/MoveItem.cpp
    src/vault/ReadFile.cpp
    src/vault/SaveFile.cpp
    src/vault/DeleteItem.cpp
    src/vault/BinIndex.cpp
    src/vault/BinIndex.h
    src/vault/MoveToBin.cpp
    src/vault/MoveToBin.h
    src/vault/GetBinTree.cpp
    src/vault/GetBinTree.h
    src/vault/RestoreFromBin.cpp
    src/vault/RestoreFromBin.h
    src/vault/DeleteFromBin.cpp
    src/vault/DeleteFromBin.h
    src/vault/UpdateLinkTargets.cpp
    src/vault/UpdateLinkTargets.h

    # Physics — force-directed graph simulation
    src/physics/ForceSimulation.cpp
    src/physics/ForceSimulation.h
    src/physics/CalculateRepulsion.cpp
    src/physics/CalculateSprings.cpp
    src/physics/CalculateGravity.cpp
    src/physics/ApplyIntegration.cpp
    src/physics/CalculateCollision.cpp
    src/physics/PhysicsWorker.cpp
    src/physics/PhysicsWorker.h

    # Graph — scene-graph edge renderer
    src/graph/BuildEdgeGeometry.cpp
    src/graph/GraphRenderer.cpp

    # AI — LLM client
    src/ai/LlmService.cpp
    src/ai/LlmService.h
)

# Theme.qml is a QML singleton.
set_source_files_properties(qml/Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)

# ── QML module (all UI under qml/) ──────────────────────────────────────────
qt_add_qml_module(appHyperLinkNotes
    URI HyperLinkNotes
    VERSION 1.0
    RESOURCE_PREFIX "/qt/qml"
    QML_FILES
        qml/Main.qml
        qml/Theme.qml

        # Core chrome
        qml/ui/core/TitleBar.qml
        qml/ui/core/TabStrip.qml
        qml/ui/core/NewTabView.qml
        qml/ui/core/EmptyState.qml
        qml/ui/core/BinPanel.qml
        qml/ui/core/SettingsPanel.qml
        qml/ui/core/DragOverlay.qml
        qml/ui/core/VaultSelectionOverlay.qml
        qml/ui/core/RightPanel.qml
        qml/ui/core/Outline.qml
        qml/ui/core/StatusBar.qml

        # Reusable components
        qml/ui/components/IconButton.qml
        qml/ui/components/WindowControlButton.qml
        qml/ui/components/SidebarToggleButton.qml
        qml/ui/components/SmoothWheel.qml
        qml/ui/components/ThemedScrollBar.qml

        # Dialogs
        qml/ui/dialogs/NewFolderDialog.qml
        qml/ui/dialogs/DeleteConfirmDialog.qml

        # Editor
        qml/ui/editor/NoteEditor.qml
        qml/ui/editor/EditorHeader.qml
        qml/ui/editor/NoteTitle.qml
        qml/ui/editor/LivePreviewEditor.qml
        qml/ui/editor/NoteSearchBar.qml

        # Sidebar
        qml/ui/sidebar/Sidebar.qml
        qml/ui/sidebar/SidebarHeader.qml
        qml/ui/sidebar/SidebarSearch.qml
        qml/ui/sidebar/FileTree.qml
        qml/ui/sidebar/TreeContextMenu.qml
        qml/ui/sidebar/TreeChevron.qml

        # Graph
        qml/ui/graph/GraphView.qml
        qml/ui/graph/GraphNode.qml
        qml/ui/graph/MiniGraph.qml

        # Scripts — window
        qml/scripts/window/deleteNodePermanently.js
        qml/scripts/window/openNewFolderDialog.js
        # Scripts — tree
        qml/scripts/tree/refreshTree.js
        qml/scripts/tree/search.js
        qml/scripts/tree/selectionUtils.js
        qml/scripts/tree/searchFlat.js
        # Scripts — file
        qml/scripts/file/openFileByPath.js
        qml/scripts/file/saveTitleNow.js
        qml/scripts/file/createNewNote.js
        qml/scripts/file/createNoteInRoot.js
        # Scripts — drag
        qml/scripts/drag/handleDropPath.js
        qml/scripts/drag/beginDragProxy.js
        qml/scripts/drag/updateDragProxy.js
        qml/scripts/drag/endDragProxy.js
        # Scripts — bin
        qml/scripts/bin/refreshBinList.js
        qml/scripts/bin/flattenTree.js
        # Scripts — editor
        qml/scripts/editor/openLink.js
        qml/scripts/editor/frontmatter.js
        qml/scripts/editor/buildContext.js
        qml/scripts/editor/branchNote.js
        # Scripts — navigation
        qml/scripts/navigation/pushHistory.js
        qml/scripts/navigation/goBack.js
        qml/scripts/navigation/goForward.js
        # Scripts — graph
        qml/scripts/graph/buildGraphData.js
        qml/scripts/graph/flattenNotes.js
        qml/scripts/graph/extractLinks.js
        qml/scripts/graph/buildGlobalGraph.js
        qml/scripts/graph/calculateLayers.js
        qml/scripts/graph/computePositions.js
        qml/scripts/graph/findNodeByPath.js
        qml/scripts/graph/getNeighbors.js
    RESOURCES
        qml/assets/sidebar_toggle_filled.svg
        qml/assets/sidebar_toggle_outline.svg
)

target_link_libraries(appHyperLinkNotes
    PRIVATE Qt6::Core Qt6::Gui Qt6::Qml Qt6::Quick Qt6::Svg Qt6::Network
)

# Windows: in Release, build as a GUI-subsystem app so NO console window opens
# beside the app (the "-mwindows" / WinMain path; Qt supplies the entry point).
# Debug stays a console app so qDebug()/logging is visible while developing.
set_target_properties(appHyperLinkNotes PROPERTIES
    WIN32_EXECUTABLE $<CONFIG:Release>)

# Scope include dirs to C++ only. The Windows RC compiler (windres) otherwise
# inherits these -I paths and its preprocessor chokes on the space in the project
# path ("CODING PROJECTS") — and it needs none of them to compile the icon.
target_include_directories(appHyperLinkNotes PRIVATE
    $<$<COMPILE_LANGUAGE:CXX>:${CMAKE_CURRENT_SOURCE_DIR}>
    $<$<COMPILE_LANGUAGE:CXX>:${CMAKE_CURRENT_SOURCE_DIR}/src/core>
    $<$<COMPILE_LANGUAGE:CXX>:${CMAKE_CURRENT_SOURCE_DIR}/src/graph>
    $<$<COMPILE_LANGUAGE:CXX>:${CMAKE_CURRENT_SOURCE_DIR}/src/physics>
    $<$<COMPILE_LANGUAGE:CXX>:${CMAKE_CURRENT_SOURCE_DIR}/src/ai>
)

target_precompile_headers(appHyperLinkNotes PRIVATE
    <QObject>
    <QString>
    <QVariantList>
    <QVariantMap>
    <QSet>
    <QDir>
    <QFile>
    <QFileInfo>
)
