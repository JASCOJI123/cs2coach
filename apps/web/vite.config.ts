import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The Mini App can be served from GitHub Pages at /cs2coach/.
// API target is configurable through VITE_API_URL for production builds.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyPort = env.VITE_API_PROXY_PORT || '8080';
  const apiTarget = `http://localhost:${proxyPort}`;
  const wsTarget = `ws://localhost:${proxyPort}`;

  return {
    base: '/cs2coach/',
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': apiTarget,
        '/ws': { target: wsTarget, ws: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});