import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { codeInspectorPlugin } from 'code-inspector-plugin';

export default defineConfig({
  plugins: [codeInspectorPlugin({
    bundler: 'vite',
  }), react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5188',
        changeOrigin: true
      }
    }
  }
});
