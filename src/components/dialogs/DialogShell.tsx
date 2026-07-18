// The shared chrome behind every modal in the app (NewFolder / Rename / AddNote /
// DeleteConfirm): 320px card, header + body + footer, over a scrim.
//
// Built on Ark UI's Dialog so the browser-native modal behaviours we used to not
// have come for free: focus trap, focus restore to whatever was focused before
// the open, Escape to dismiss, click-outside to dismiss, `aria-modal` + the
// title wired up via aria-labelledby, and inert/`hidden` on the content below.
//
// PRESENCE: Ark owns it. `lazyMount` + `unmountOnExit` mean the body subtree is
// created on open and disposed after the exit animation — the same
// re-instantiate-per-open contract the old <Presence> wrapper gave us, which is
// what lets a body's `ref` callback re-seed a field on every open. The exit
// animation is driven by [data-state="closed"] on the scrim/card (chrome.css),
// replacing the old hand-rolled `is-closing` class.
//
// The dialog stays a CONTROLLED component: `open` is read from the app's own
// signals and `onClose` calls the app's own closer, so state ownership is
// unchanged — Ark never becomes the source of truth.
import { type JSX } from "solid-js";
import { Dialog } from "@ark-ui/solid/dialog";
import { Portal } from "solid-js/web";

export const DialogShell = (props: {
  open: boolean;
  onClose: () => void;
  /** Accessible name + visible header text. */
  title: string;
  /** Focused when the dialog opens; without it Ark focuses the card itself. */
  initialFocus?: () => HTMLElement | null | undefined;
  children: JSX.Element;
  footer: JSX.Element;
}) => (
  <Dialog.Root
    open={props.open}
    onOpenChange={(e) => {
      if (!e.open) props.onClose();
    }}
    initialFocusEl={() => props.initialFocus?.() ?? null}
    lazyMount
    unmountOnExit
  >
    <Portal>
      <Dialog.Backdrop class="dialog-scrim" />
      <Dialog.Positioner class="dialog-positioner">
        <Dialog.Content class="dialog">
          <div class="dialog__header">
            <Dialog.Title class="dialog__title">{props.title}</Dialog.Title>
          </div>
          {props.children}
          <div class="dialog__footer">{props.footer}</div>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
);

// The two footer buttons every dialog has. `tone` picks the confirm button's
// fill; "accent" pairs --accent with --on-accent, "danger" pairs --danger with
// white — both are the contrast-floored pairings from theme.css.
export const DialogActions = (props: {
  cancelLabel?: string;
  confirmLabel: string;
  tone?: "accent" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <>
    <button class="dialog-btn dialog-btn--cancel" onClick={props.onCancel}>
      {props.cancelLabel ?? "Cancel"}
    </button>
    <button
      class="dialog-btn"
      classList={{
        "dialog-btn--create": (props.tone ?? "accent") === "accent",
        "dialog-btn--delete": props.tone === "danger",
      }}
      onClick={props.onConfirm}
    >
      {props.confirmLabel}
    </button>
  </>
);
