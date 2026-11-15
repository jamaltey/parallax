import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { spherexRoute } from './spherex.js';
import { exposureRoute } from './exposure.js';
import { objectLookupRoute } from './objects.js';
import { publicApiRoute } from './public-api.js';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.fits': 'application/fits',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const server = createServer((req, res) => {
  void publicApiRoute(req, res, () =>
    spherexRoute(req, res, () =>
      exposureRoute(req, res, () =>
        objectLookupRoute(req, res, async () => {
          if (!['GET', 'HEAD'].includes(req.method)) {
            res.writeHead(405);
            res.end();
            return;
          }
          try {
            const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            const file = resolve(
              root,
              `.${pathname === '/' || /^\/developers\/?$/.test(pathname) || /^\/community(?:\/[a-f0-9-]+)?\/?$/.test(pathname) ? '/index.html' : pathname}`
            );
            if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
              res.writeHead(403);
              res.end();
              return;
            }
            const content = await readFile(file);
            res.writeHead(200, {
              'Content-Type': types[extname(file)] || 'application/octet-stream',
              'X-Content-Type-Options': 'nosniff',
            });
            res.end(req.method === 'HEAD' ? undefined : content);
          } catch {
            res.writeHead(404);
            res.end('Not found. Run npm run build before npm start.');
          }
        })
      )
    )
  );
});
server.listen(Number(process.env.PORT) || 3000, process.env.HOST || '127.0.0.1', () =>
  console.log(
    `Parallax: http://${process.env.HOST || '127.0.0.1'}:${Number(process.env.PORT) || 3000}`
  )
);
