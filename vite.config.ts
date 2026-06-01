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
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              recharts: ['recharts'],
              exceljs: ['exceljs'],
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
