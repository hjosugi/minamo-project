import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = dirname(fileURLToPath(import.meta.url));
const page = (file: string) => resolve(configDir, file);

export default defineConfig({
  root: '.',
  base: './',
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        avatarMapping: page('diagnostics/avatar-mapping.html'),
        desktop: page('desktop/index.html'),
        drumOverlay: page('viewer/drum-overlay.html'),
        handStability: page('diagnostics/no-broken-finger.html'),
        index: page('index.html'),
        landing: page('landing/index.html'),
        replay: page('replay/index.html'),
        roadmap: page('roadmap/index.html'),
        tracker: page('tracker/index.html'),
        viewer: page('viewer/index.html'),
      },
    },
  },
});
