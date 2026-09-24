import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { codeInspectorPlugin } from 'code-inspector-plugin';

export default defineConfig({
  plugins: [codeInspectorPlugin({
    bundler: 'vite',
  }), react()],
  server: {
    // Keep localhost on IPv4 so a different service cannot answer the user's URL
    // while Vite silently falls back to an IPv6 listener.
    host: '127.0.0.1',
    port: Number(process.env.FRONTEND_PORT || 5173),
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5188',
        changeOrigin: true
      }
    }
  }
});
