import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Use a relative base so the same build works from the normal Pages URL and
// from versioned Mini App paths (for example /cs2coach/v2/). This also makes
// Telegram cache-busting by path safe without rebuilding asset URLs manually.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyPort = env.VITE_API_PROXY_PORT || '8080';
  const apiTarget = `http://localhost:${proxyPort}`;
  const wsTarget = `ws://localhost:${proxyPort}`;

  return {
    base: './',
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
