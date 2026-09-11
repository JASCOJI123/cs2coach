import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The Mini App is served by the bot / static host; API target is the dev API.
// The default target is :8080; override the port locally via apps/web/.env
// (e.g. VITE_API_PROXY_PORT=8099) when another process owns 8080.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyPort = env.VITE_API_PROXY_PORT || '8080';
  const apiTarget = `http://localhost:${proxyPort}`;
  const wsTarget = `ws://localhost:${proxyPort}`;

  return {
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