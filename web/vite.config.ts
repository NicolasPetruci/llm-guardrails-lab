import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A tela chama /api/... e o Vite repassa para o servidor da demonstração
// (npm run server, na pasta de cima), tirando o prefixo.
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3100';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: API_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
