import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { codeInspectorPlugin } from 'code-inspector-plugin';

export default defineConfig({
  plugins: [react(), codeInspectorPlugin({
    bundler: 'vite',
  })],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});

