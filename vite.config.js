import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { spherexRoute } from './server/spherex.js';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'spherex-archive',
      configureServer(server) {
        server.middlewares.use(spherexRoute);
      },
      configurePreviewServer(server) {
        server.middlewares.use(spherexRoute);
      },
    },
  ],
  base: './',
});
