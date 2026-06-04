import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const apiPort = env.API_PORT || '3001';
    const devPort = Number(env.VITE_DEV_PORT || '3000');
    const apiTarget =
      env.VITE_API_PROXY?.replace(/\/$/, '') || `http://localhost:${apiPort}`;

    return {
      server: {
        port: devPort,
        host: '0.0.0.0',
        strictPort: false,
        proxy: {
          '/api': {
            target: apiTarget,
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      preview: {
        port: 4173,
        proxy: {
          '/api': {
            target: apiTarget,
            changeOrigin: true,
          },
        },
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules/recharts')) return 'recharts';
              if (id.includes('node_modules/exceljs')) return 'exceljs';
            },
          },
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
