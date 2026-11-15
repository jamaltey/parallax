import { extractScienceImage } from '../src/lib/fits.js';

const IRSA_ORIGIN = 'https://irsa.ipac.caltech.edu';
// IRSA's public AWS Open Data mirror holds the same files under the same relative paths.
const S3_MIRROR = 'https://nasa-irsa-spherex.s3.amazonaws.com/';
const IRSA_ATTEMPT_MS = 25000;
const PREFIX_BYTES = 18 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const cache = new Map();

export function exposureUrl(value) {
  const url = new URL(value);
  if (
    url.origin !== IRSA_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/ibe\/data\/spherex\/(dr1|qr3)\/level2\/[A-Za-z0-9_/-]+\.fits$/.test(url.pathname) ||
    value.includes('..')
  )
    throw new Error('Only original SPHEREx exposure files are accepted.');
  return url.href;
}

/** The AWS mirror URL for an already validated IRSA exposure URL. */
export function mirrorUrl(source) {
  return S3_MIRROR + new URL(source).pathname.replace(/^\/ibe\/data\/spherex\//, '');
}

async function download(url, signal, timeoutMs) {
  const attempt = timeoutMs ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : signal;
  const response = await fetch(url, {
    signal: attempt,
    redirect: 'error',
    headers: { Range: `bytes=0-${PREFIX_BYTES - 1}` },
  });
  if (![200, 206].includes(response.status))
    throw new Error(`Original exposure is unavailable (IRSA ${response.status}).`);
  return readPrefix(response);
}

function rangedLength(response) {
  if (response.status !== 206) return null;
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
  if (!match) throw new Error('IRSA returned an invalid Content-Range.');
  const [, startText, endText, totalText] = match;
  const start = Number(startText);
  const end = Number(endText);
  const total = Number(totalText);
  const expectedEnd = Math.min(PREFIX_BYTES - 1, total - 1);
  if (
    start !== 0 ||
    end !== expectedEnd ||
    !Number.isSafeInteger(total) ||
    total <= end ||
    end >= PREFIX_BYTES
  )
    throw new Error('IRSA returned an unexpected Content-Range.');
  const length = end + 1;
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && Number(declaredLength) !== length)
    throw new Error('IRSA returned an inconsistent ranged response.');
  return length;
}

async function readPrefix(response) {
  const expectedLength = rangedLength(response);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Original exposure has no response body.');
  const limit = expectedLength ?? PREFIX_BYTES;
  const chunks = [];
  let size = 0;
  let received = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new Error('Exposure exceeds the 100 MB limit.');
    }
    const remaining = limit - size;
    const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
    chunks.push(chunk);
    size += chunk.byteLength;
  }
  if (size === limit) await reader.cancel();
  if (expectedLength !== null && size !== expectedLength)
    throw new Error('IRSA returned an incomplete ranged response.');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function exposureRoute(req, res, next = () => {}) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/spherex-image') return next();
  const fail = (status, message) => {
    if (!res.destroyed) {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
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
      let bytes;
      try {
        bytes = await download(source, controller.signal, IRSA_ATTEMPT_MS);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        // Same file, same bytes, from IRSA's AWS mirror when IRSA's own file server fails.
        bytes = await download(mirrorUrl(source), controller.signal);
      }
      image = extractScienceImage(bytes.buffer);
      if (cache.size >= 3) cache.delete(cache.keys().next().value);
      cache.set(source, image);
    }
    if (!res.destroyed) {
      res.writeHead(200, {
        'Content-Type': 'application/fits',
        'Cache-Control': 'private, max-age=86400, immutable',
      });
      res.end(image);
    }
  } catch (error) {
    fail(502, controller.signal.aborted ? 'Exposure request timed out. Retry.' : error.message);
  } finally {
    clearTimeout(timeout);
  }
}
