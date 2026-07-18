// Startup / no-tabs state (EmptyState.qml): a centred two-line hint shown when
// no note is open. Overlays the editor area.
import type { Component } from "solid-js";

const EmptyState: Component = () => (
  <div class="empty-state">
    <div class="empty-state__title">No note open</div>
    <div class="empty-state__sub">
      Select a note from the sidebar or create a new one to begin writing.
    </div>
  </div>
);

export default EmptyState;
