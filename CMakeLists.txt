cmake_minimum_required(VERSION 3.16)

project(HyperLinkNotes VERSION 0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Qml Quick Svg Network)
qt_policy(SET QTP0001 NEW)

qt_add_executable(appHyperLinkNotes
    main.cpp
    VaultRepository.cpp
    VaultRepository.h
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
    VaultViewModel.cpp
    VaultViewModel.h
    MarkdownHighlighter.cpp
    MarkdownHighlighter.h
    src/markdown/HighlightLinks.cpp
    src/markdown/HighlightHeaders.cpp
    src/markdown/HighlightCodeBlocks.cpp
    ForceSimulation.cpp
    ForceSimulation.h
    src/physics/CalculateRepulsion.cpp
    src/physics/CalculateSprings.cpp
    src/physics/CalculateGravity.cpp
    src/physics/ApplyIntegration.cpp
    src/physics/CalculateCollision.cpp
    src/physics/PhysicsWorker.cpp
    src/physics/PhysicsWorker.h
    src/graph/BuildEdgeGeometry.cpp
    src/graph/GraphRenderer.cpp
    src/ai/LlmService.cpp
    src/ai/LlmService.h
)

set_source_files_properties(Theme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)

qt_add_qml_module(appHyperLinkNotes
    URI HyperLinkNotes
    VERSION 1.0
    RESOURCE_PREFIX "/qt/qml"
    QML_FILES
        Main.qml
        Theme.qml
        ui/core/TitleBar.qml
        ui/core/TabStrip.qml
        ui/core/NewTabView.qml
        ui/dialogs/CustomDialog.qml
        ui/components/IconButton.qml
        ui/core/BinPanel.qml
        ui/core/SettingsPanel.qml
        ui/components/WindowControlButton.qml
        ui/components/SidebarToggleButton.qml
        ui/core/VaultSelectionOverlay.qml
        ui/core/DragOverlay.qml
        ui/core/EmptyState.qml
        ui/dialogs/NewFolderDialog.qml
        ui/dialogs/DeleteConfirmDialog.qml
        ui/dialogs/RenameWarningPopup.qml
        ui/editor/NoteEditor.qml
        ui/editor/EditorHeader.qml
        ui/editor/NoteTitle.qml
        ui/editor/NoteBody.qml
        ui/editor/NotePicker.qml
        ui/sidebar/Sidebar.qml
        ui/sidebar/SidebarHeader.qml
        ui/sidebar/SidebarSearch.qml
        ui/sidebar/FileTree.qml
        ui/sidebar/FolderTreeItem.qml
        ui/sidebar/TreeContextMenu.qml
        ui/sidebar/TreeChevron.qml
        scripts/window/toggleMaximize.js
        scripts/window/deleteNodePermanently.js
        scripts/window/openNewFolderDialog.js
        scripts/tree/refreshTree.js
        scripts/tree/search.js
        scripts/tree/toggleExpansion.js
        scripts/tree/runExpansionAnimation.js
        scripts/tree/flattenVisible.js
        scripts/tree/selectionUtils.js
        scripts/tree/searchFlat.js
        scripts/file/openFileByPath.js
        scripts/file/saveTitleNow.js
        scripts/file/createNewNote.js
        scripts/file/createNoteInRoot.js
        scripts/drag/handleDropPath.js
        scripts/drag/beginDragProxy.js
        scripts/drag/updateDragProxy.js
        scripts/drag/endDragProxy.js
        scripts/bin/refreshBinList.js
        scripts/bin/flattenTree.js
        scripts/editor/wrapSelectionInLink.js
        scripts/editor/createNoteFromSelection.js
        scripts/editor/openLink.js
        scripts/editor/frontmatter.js
        scripts/editor/buildContext.js
        scripts/editor/branchNote.js
        scripts/navigation/pushHistory.js
        scripts/navigation/goBack.js
        scripts/navigation/goForward.js
        scripts/graph/buildGraphData.js
        scripts/graph/flattenNotes.js
        scripts/graph/extractLinks.js
        scripts/graph/buildGlobalGraph.js
        scripts/graph/calculateLayers.js
        scripts/graph/computePositions.js
        scripts/graph/findNodeByPath.js
        scripts/graph/getNeighbors.js
        ui/graph/GraphView.qml
        ui/graph/GraphNode.qml
    RESOURCES
        sidebar_toggle_filled.svg
        sidebar_toggle_outline.svg
)

target_link_libraries(appHyperLinkNotes
    PRIVATE Qt6::Core Qt6::Gui Qt6::Qml Qt6::Quick Qt6::Svg Qt6::Network
)

target_include_directories(appHyperLinkNotes PRIVATE
    .
    src/graph
    src/physics
    src/ai
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
