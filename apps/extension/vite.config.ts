import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: path.resolve(extensionDir, 'src'),
  // Vite loads .env files relative to `root` by default; override so it
  // still finds apps/extension/.env instead of looking under src/.
  envDir: path.resolve(extensionDir),
  publicDir: path.resolve(extensionDir, 'public'),
  plugins: [react()],
  build: {
    outDir: path.resolve(extensionDir, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(extensionDir, 'src/popup/index.html'),
      },
    },
  },
});
