import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Mini App is served by the bot / static host; API target is the dev API.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});