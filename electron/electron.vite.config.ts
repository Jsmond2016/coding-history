import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          index: resolve('src/main.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          index: resolve('src/preload.ts'),
        },
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
