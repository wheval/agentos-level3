import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

const shim = (name: string) => fileURLToPath(new URL(`./src/shims/${name}.ts`, import.meta.url));

// The Midnight runtime and ledger packages are WASM modules that use top-level
// await, so both plugins are required for a browser build.
export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      // Several Midnight packages still reach for Node's Buffer.
      buffer: 'buffer/',
      // Node builtin reached through @subsquid; Vite would otherwise leave it
      // externalised and undefined in the browser bundle.
      assert: shim('assert'),
      // Ships a default-only browser build, but the indexer provider imports
      // `{ WebSocket }` by name.
      'isomorphic-ws': shim('isomorphic-ws'),
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    // Pre-bundling breaks the WASM initialisation in these packages.
    exclude: [
      '@midnight-ntwrk/compact-runtime',
      '@midnight-ntwrk/ledger-v8',
      '@midnight-ntwrk/onchain-runtime-v3',
    ],
    // compact-runtime is excluded above, so its CommonJS dependency would
    // otherwise be served raw and fail its default import in dev.
    include: ['object-inspect'],
  },
  build: {
    target: 'esnext',
  },
  server: {
    fs: { allow: ['.'] },
  },
});
