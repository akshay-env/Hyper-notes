// Enter/exit presence for overlays. Mounts children while `when` is true; when it
// flips false, keeps them mounted for `exit` ms and flags `closing` so a CSS exit
// animation can play before unmount. The child is a render function receiving the
// `closing` accessor — apply it as an `is-closing` class on the animating root.
// (Home-grown so the motion is ours end-to-end — no animation dependency.)
import { type JSX, createSignal, createEffect, onCleanup } from "solid-js";

export function Presence(props: {
  when: boolean;
  exit?: number;
  children: (closing: () => boolean) => JSX.Element;
}): JSX.Element {
  const [mounted, setMounted] = createSignal(props.when);
  const [closing, setClosing] = createSignal(false);
  let timer: number | undefined;

  createEffect(() => {
    if (props.when) {
      if (timer) clearTimeout(timer);
      setClosing(false);
      setMounted(true);
    } else {
      setClosing(true);
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, props.exit ?? 200);
    }
  });
  onCleanup(() => timer && clearTimeout(timer));

  // Reactive child: re-instantiates the subtree on each open (so dialog autofocus /
  // keydown listeners re-run) and disposes it after the exit delay.
  return <>{mounted() ? props.children(closing) : null}</>;
}
