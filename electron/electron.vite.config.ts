import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('src/main.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('src/preload.ts'),
        formats: ['cjs'],
      },
    },
  },
  renderer: {
    root: resolve('../frontend'),
    build: {
      rollupOptions: {
        input: resolve('../frontend/index.html'),
      },
    },
  },
});
