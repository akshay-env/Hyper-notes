// Anchors an Ark UI menu to a free pointer position.
//
// WHY THIS EXISTS: Ark's Menu can normally only be anchored to a Trigger or its
// own ContextTrigger element. `Menu.Root` accepts an `anchorPoint` prop in its
// TYPES, but the machine never reads it — in @zag-js/menu it is declared as a
// context bindable with `defaultValue: null` and is only ever written by the
// CONTEXT_MENU event that ContextTrigger sends. Passing it as a prop silently
// does nothing and the panel lands at 0,0.
//
// Both context menus in this app open at a pointer position inside a surface we
// don't own — a file-tree row, or the CodeMirror content — so neither can use a
// trigger element. Instead we re-anchor imperatively once the menu is open.
// That is safe to be the last word: the machine calls getPlacement with
// `listeners: false`, so nothing repositions afterwards and undoes it.
//
// Renders nothing; drop it inside <Menu.Root> alongside the Portal.
import { createEffect } from "solid-js";
import { Menu } from "@ark-ui/solid/menu";

export const MenuPointAnchor = (props: { point: () => { x: number; y: number } | null }) => (
  <Menu.Context>
    {(api) => {
      createEffect(() => {
        const p = props.point();
        if (!p) return;
        api().reposition({
          getAnchorRect: () => ({ x: p.x, y: p.y, width: 0, height: 0 }),
        });
      });
      return null;
    }}
  </Menu.Context>
);
