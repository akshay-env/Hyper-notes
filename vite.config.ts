import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

// Cross-origin isolation enables the zero-copy SharedArrayBuffer channel
// between the physics worker and the render thread. COEP `credentialless`
// (NOT `require-corp`) is deliberate: require-corp blocks every external
// image embedded in notes, credentialless just loads them without cookies.
// Environments without isolation fall back to transferable buffers.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

export default defineConfig({
  plugins: [tailwindcss(), solid()],
  server: {
    port: 1420,
    strictPort: true,
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
});
