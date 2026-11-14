import { archiveSearchUrl } from '../supabase/functions/_shared/archive.js';

// Fixed upstream and validated parameters: this is not an arbitrary URL proxy.
export async function spherexRoute(req, res, next = () => {}) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/spherex-exposures') return next();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET' });
    return res.end(JSON.stringify({ error: 'Use GET for archive searches.' }));
  }
  let upstream;
  try {
    for (const key of ['ra', 'dec', 'fov'])
      if (!url.searchParams.has(key) || !url.searchParams.get(key).trim())
        throw new Error(`Missing ${key}.`);
    upstream = archiveSearchUrl(
      {
        ra: Number(url.searchParams.get('ra')),
        dec: Number(url.searchParams.get('dec')),
        fov: Number(url.searchParams.get('fov')),
      },
      url.searchParams.get('collection') || 'spherex_dr1'
    );
  } catch (error) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: error.message }));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  res.on('close', () => controller.abort());
  try {
    const result = await fetch(upstream, { signal: controller.signal, redirect: 'error' });
    if (!result.ok) throw new Error(`IRSA returned HTTP ${result.status}.`);
    const text = await result.text();
    if (!res.destroyed) {
      res.writeHead(200, { 'Content-Type': 'text/tab-separated-values; charset=utf-8' });
      res.end(text);
    }
  } catch {
    if (!res.destroyed) {
      res.writeHead(502);
      res.end(
        JSON.stringify({ error: 'IRSA is unavailable or the search timed out. Please retry.' })
      );
    }
  } finally {
    clearTimeout(timer);
  }
}
