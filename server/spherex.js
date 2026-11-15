import { archiveSearchUrl, archiveTapRequest } from '../src/api/spherex.js';
import { normalizeTapArchiveTable } from './spherex-tap.js';

const cache = new Map();
const MAX_CACHE_ENTRIES = 30;
const CACHE_TTL_MS = 15 * 60 * 1000;

function cacheKey(position, collection) {
  return `${collection}:${position.ra}:${position.dec}`;
}

function remember(key, text) {
  cache.delete(key);
  cache.set(key, { text, savedAt: Date.now() });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

async function fetchWithTimeout(url, timeoutMs, parentSignal, options = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const result = await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: 'error',
    });
    if (!result.ok) throw new Error(`IRSA returned HTTP ${result.status}.`);
    const text = await result.text();
    if (/^\s*</.test(text)) throw new Error('IRSA returned an HTML error instead of archive data.');
    return text;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abort);
  }
}

async function fetchWithRetries(url, { attempts, timeoutMs, signal, options }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetchWithTimeout(url, timeoutMs, signal, options);
    } catch (error) {
      lastError = error;
      if (signal?.aborted || attempt === attempts) break;
      await new Promise(resolve => setTimeout(resolve, 350 * attempt));
    }
  }
  throw lastError;
}

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
  let tapUpstream;
  let position;
  let collection;
  try {
    for (const key of ['ra', 'dec', 'fov'])
      if (!url.searchParams.has(key) || !url.searchParams.get(key).trim())
        throw new Error(`Missing ${key}.`);
    position = {
      ra: Number(url.searchParams.get('ra')),
      dec: Number(url.searchParams.get('dec')),
      fov: Number(url.searchParams.get('fov')),
    };
    collection = url.searchParams.get('collection') || 'spherex_dr1';
    upstream = archiveSearchUrl(position, collection);
    tapUpstream = archiveTapRequest(position, collection);
  } catch (error) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: error.message }));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 29000);
  res.on('close', () => controller.abort());
  try {
    let text;
    let source = 'sia';
    try {
      text = await fetchWithRetries(upstream, {
        attempts: 2,
        timeoutMs: 5000,
        signal: controller.signal,
      });
    } catch {
      source = 'tap';
      const tap = await fetchWithRetries(tapUpstream.url, {
        attempts: 2,
        timeoutMs: 8000,
        signal: controller.signal,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Accept: 'text/tab-separated-values',
          },
          body: tapUpstream.body,
        },
      });
      text = normalizeTapArchiveTable(tap, collection);
    }
    remember(cacheKey(position, collection), text);
    if (!res.destroyed) {
      res.writeHead(200, {
        'Content-Type': 'text/tab-separated-values; charset=utf-8',
        'X-Parallax-Archive-Source': source,
      });
      res.end(text);
    }
  } catch {
    if (!res.destroyed) {
      const saved = cache.get(cacheKey(position, collection));
      if (saved && Date.now() - saved.savedAt <= CACHE_TTL_MS) {
        res.writeHead(200, {
          'Content-Type': 'text/tab-separated-values; charset=utf-8',
          'X-Parallax-Archive-Source': 'cache',
          Warning: '110 - "IRSA unavailable; serving a recently verified query result"',
        });
        res.end(saved.text);
      } else {
        res.writeHead(502);
        res.end(
          JSON.stringify({
            error:
              'IRSA SIA and TAP are both unavailable or timed out. No observation data were substituted; please retry.',
          })
        );
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
