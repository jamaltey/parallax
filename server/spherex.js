import { mkdir, readFile, stat, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { archiveSearchUrl, archiveTapRequest } from '../src/api/spherex.js';
import { normalizeTapArchiveTable } from './spherex-tap.js';
import { indexArchiveTable } from './spherex-index.js';

// Fallback order when a search is requested:
//   1. IRSA SIA, then IRSA TAP (live, authoritative)
//   2. a recent verified IRSA answer for the same position (memory, then disk), ≤ 24 h old
//   3. Parallax's offline footprint index of IRSA's public AWS mirror (real files, see
//      scripts/build-spherex-index.mjs)
//   4. an older verified IRSA answer, ≤ 30 days old
// No step ever invents observations; every row points at a real IRSA exposure file.

const MAX_MEMORY_ENTRIES = 30;
const FRESH_CACHE_MS = 24 * 60 * 60 * 1000;
const STALE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
// After SIA and TAP have both failed, skip them for this long so users get the fallback
// immediately instead of waiting through the retries again on every search.
const CIRCUIT_OPEN_MS = 60 * 1000;

const memory = new Map();
let cacheDir = process.env.SPHEREX_CACHE_DIR || path.resolve('data/spherex-cache');
let irsaDownUntil = 0;

/** Test hook: isolate the disk cache and reset the circuit breaker and memory cache. */
export function resetArchiveState({ cacheDirectory } = {}) {
  memory.clear();
  irsaDownUntil = 0;
  if (cacheDirectory !== undefined) cacheDir = cacheDirectory;
}

function cacheKey(position, collection) {
  return `${collection}:${position.ra}:${position.dec}`;
}

function cacheFile(key) {
  return cacheDir && path.join(cacheDir, `${key.replace(/[^A-Za-z0-9_.+-]/g, '_')}.tsv`);
}

function remember(key, text) {
  const savedAt = Date.now();
  memory.delete(key);
  memory.set(key, { text, savedAt });
  while (memory.size > MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value);
  const file = cacheFile(key);
  if (file)
    // Persist so a verified answer survives restarts; failures here never affect the response.
    mkdir(cacheDir, { recursive: true })
      .then(() => writeFile(`${file}.tmp`, text))
      .then(() => rename(`${file}.tmp`, file))
      .catch(() => {});
}

async function recall(key) {
  const hit = memory.get(key);
  if (hit) return hit;
  const file = cacheFile(key);
  if (!file) return null;
  try {
    const [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
    return { text, savedAt: info.mtimeMs };
  } catch {
    return null;
  }
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

async function searchIrsa(upstream, tapUpstream, collection, signal) {
  try {
    const text = await fetchWithRetries(upstream, { attempts: 2, timeoutMs: 5000, signal });
    return { text, source: 'sia' };
  } catch {
    const tap = await fetchWithRetries(tapUpstream.url, {
      attempts: 2,
      timeoutMs: 8000,
      signal,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'text/tab-separated-values',
        },
        body: tapUpstream.body,
      },
    });
    return { text: normalizeTapArchiveTable(tap, collection), source: 'tap' };
  }
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
  const key = cacheKey(position, collection);
  const send = (text, headers) => {
    if (res.destroyed) return;
    res.writeHead(200, { 'Content-Type': 'text/tab-separated-values; charset=utf-8', ...headers });
    res.end(text);
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 29000);
  res.on('close', () => controller.abort());
  try {
    if (Date.now() >= irsaDownUntil) {
      try {
        const { text, source } = await searchIrsa(
          upstream,
          tapUpstream,
          collection,
          controller.signal
        );
        irsaDownUntil = 0;
        remember(key, text);
        return send(text, { 'X-Parallax-Archive-Source': source });
      } catch {
        if (res.destroyed) return; // the client left; don't judge IRSA by an aborted request
        irsaDownUntil = Date.now() + CIRCUIT_OPEN_MS;
      }
    }
    const saved = await recall(key);
    const age = saved ? Date.now() - saved.savedAt : Infinity;
    const cached = () =>
      send(saved.text, {
        'X-Parallax-Archive-Source': 'cache',
        'X-Parallax-Archive-Saved-At': new Date(saved.savedAt).toISOString(),
        Warning: '110 - "IRSA unavailable; serving a recently verified query result"',
      });
    if (age <= FRESH_CACHE_MS) return cached();
    const offline = await indexArchiveTable(position, collection);
    if (offline)
      return send(offline.text, {
        'X-Parallax-Archive-Source': 'index',
        'X-Parallax-Index-Built-At': offline.builtAt || '',
        'X-Parallax-Index-Periods': String(offline.periods),
        Warning: '110 - "IRSA search unavailable; results from the Parallax index of IRSA\'s AWS mirror"',
      });
    if (age <= STALE_CACHE_MS) return cached();
    if (!res.destroyed) {
      res.writeHead(502);
      res.end(
        JSON.stringify({
          error:
            'IRSA SIA and TAP are both unavailable or timed out. No observation data were substituted; please retry.',
        })
      );
    }
  } finally {
    clearTimeout(timer);
  }
}
