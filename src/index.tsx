/* Entry — mounts the app. */
import { render } from "solid-js/web";
import "katex/dist/katex.min.css";
import "./theme/theme.css";
import "./index.css";
import App from "./App";
import { initKeys } from "./state/settings";

// Adopts any API keys left in localStorage by an older build into the OS credential
// store and scrubs them. Async and non-blocking: until it resolves the AI features
// simply read as "no key", which is the safe default.
void initKeys();

render(() => <App />, document.getElementById("root")!);
