import { IMAGE_VERSION } from '../citizen/model.js';
import { exposureCacheKey } from './exposureCache.js';

const CACHE_NAME = `parallax-prepared-exposures-${IMAGE_VERSION}`;
let cachePromise;

function cacheRequest(exposure) {
  const key = encodeURIComponent(exposureCacheKey(exposure));
  return new Request(`${globalThis.location.origin}/__parallax_prepared__/${key}`);
}

async function openCache() {
  if (!globalThis.caches || !globalThis.location) return null;
  cachePromise ||= globalThis.caches.open(CACHE_NAME).catch(() => null);
  return cachePromise;
}

export async function getPersistentExposureDisplay(exposure) {
  const cache = await openCache();
  if (!cache) return null;
  try {
    const response = await cache.match(cacheRequest(exposure));
    if (!response) return null;
    const buffer = await response.arrayBuffer();
    return buffer.byteLength ? buffer : null;
  } catch {
    return null;
  }
}

export async function cachePersistentExposureDisplay(exposure, displayBuffer) {
  const cache = await openCache();
  if (!cache) return false;
  try {
    await cache.put(
      cacheRequest(exposure),
      new Response(displayBuffer, {
        headers: {
          'Content-Type': 'application/fits',
          'X-Parallax-Image-Version': IMAGE_VERSION,
        },
      })
    );
    return true;
  } catch {
    return false;
  }
}
