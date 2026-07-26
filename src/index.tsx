/* Entry — mounts the app. */
import { render } from "solid-js/web";
import "katex/dist/katex.min.css";
import "./theme/theme.css";
import "./index.css";
import App from "./App";
import { initKeys } from "./state/settings";
import { bootVault } from "./state/ui";

// Adopts any API keys left in localStorage by an older build into the OS credential
// store and scrubs them. Async and non-blocking: until it resolves the AI features
// simply read as "no key", which is the safe default.
void initKeys();

// Decides what the app opens into: a remembered vault, the VaultGate landing
// page, or (dev preview with no filesystem) straight to the mock-data shell if
// "Continue without a folder" was chosen before. Runs before render() so the
// synchronous cases (browser preview; no remembered vault) never paint
// vaultStatus's "booting" placeholder at all — see state/session.ts.
void bootVault();

render(() => <App />, document.getElementById("root")!);
