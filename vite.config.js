import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { exposureRoute } from './server/exposure.js';
import { spherexRoute } from './server/spherex.js';
import { objectLookupRoute } from './server/objects.js';
import { publicApiRoute } from './server/public-api.js';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'spherex-archive',
      configureServer(server) {
        server.middlewares.use(publicApiRoute);
        server.middlewares.use(spherexRoute);
        server.middlewares.use(exposureRoute);
        server.middlewares.use(objectLookupRoute);
      },
      configurePreviewServer(server) {
        server.middlewares.use(publicApiRoute);
        server.middlewares.use(spherexRoute);
        server.middlewares.use(exposureRoute);
        server.middlewares.use(objectLookupRoute);
      },
    },
  ],
  base: '/',
  server: {
    host: true,
  },
});
