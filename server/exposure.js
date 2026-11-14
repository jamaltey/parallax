import { extractScienceImage } from '../src/lib/fits.js';
import { exposureUrl } from '../supabase/functions/_shared/archive.js';
export { exposureUrl } from '../supabase/functions/_shared/archive.js';
const cache = new Map();
export async function exposureRoute(req, res, next = () => {}) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/spherex-image') return next();
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, message) => {
    if (!res.destroyed) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
  };
  if (req.method !== 'GET') return fail(405, 'Use GET.');
  let source;
  try {
    source = exposureUrl(url.searchParams.get('url'));
  } catch {
    return fail(400, 'Invalid SPHEREx file URL.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  res.on('close', () => controller.abort());
  try {
    let image = cache.get(source);
    if (!image) {
      const response = await fetch(source, { signal: controller.signal, redirect: 'error' });
      if (!response.ok)
        throw new Error(`Original exposure is unavailable (IRSA ${response.status}).`);
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 100 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('Exposure exceeds the 100 MB limit.');
        }
        chunks.push(value);
        if (size >= 18 * 1024 * 1024) {
          await reader.cancel();
          break;
        }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      image = extractScienceImage(bytes.buffer);
      if (cache.size >= 3) cache.delete(cache.keys().next().value);
      cache.set(source, image);
    }
    if (!res.destroyed) {
      res.writeHead(200, { 'Content-Type': 'application/fits' });
      res.end(image);
    }
  } catch (error) {
    fail(502, controller.signal.aborted ? 'Exposure request timed out. Retry.' : error.message);
  } finally {
    clearTimeout(timeout);
  }
}
