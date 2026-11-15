import {
  cacheExposureDisplay,
  getCachedExposureDisplay,
  loadSpherexExposure,
} from './loadExposure.js';
import { exposureCacheKey } from './exposureCache.js';
import {
  cachePersistentExposureDisplay,
  getPersistentExposureDisplay,
} from './persistentDisplayCache.js';

const pending = new Map();

function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(new DOMException('The request was aborted.', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('The request was aborted.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function prepare(exposure) {
  const persistent = getPersistentExposureDisplay(exposure);
  const loaded = await loadSpherexExposure(exposure);
  let displayBuffer = getCachedExposureDisplay(exposure);
  let persistPromise = Promise.resolve(true);
  if (!displayBuffer) {
    displayBuffer = await persistent;
    if (displayBuffer) cacheExposureDisplay(exposure, displayBuffer);
  }
  if (!displayBuffer) {
    displayBuffer = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./renderFits.worker.js', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = ({ data }) => {
        worker.terminate();
        data.error ? reject(new Error(data.error)) : resolve(data.buffer);
      };
      worker.onerror = () => {
        worker.terminate();
        reject(new Error('Could not prepare the observation image.'));
      };
      const source = loaded.buffer.slice(0);
      worker.postMessage(source, [source]);
    });
    cacheExposureDisplay(exposure, displayBuffer);
    persistPromise = cachePersistentExposureDisplay(exposure, displayBuffer);
  }
  return { ...loaded, displayBuffer, persistPromise };
}

export function prepareExposureDisplay(exposure, { signal } = {}) {
  const key = exposureCacheKey(exposure);
  let task = pending.get(key);
  if (!task) {
    task = prepare(exposure).finally(() => pending.delete(key));
    pending.set(key, task);
  }
  return abortable(task, signal);
}

export async function preloadExposureDisplays(
  exposures,
  { signal, concurrency = 2, maxBytes = Infinity, onProgress } = {}
) {
  const rows = [...new Map(exposures.map(exposure => [exposure.id, exposure])).values()];
  let cursor = 0;
  let completed = 0;
  let failed = 0;
  let storageFailed = 0;
  let preparedBytes = 0;
  let skipped = 0;
  const next = async () => {
    while (!signal?.aborted) {
      const index = cursor++;
      if (index >= rows.length) return;
      if (preparedBytes >= maxBytes) {
        skipped++;
        completed++;
        onProgress?.({ completed, total: rows.length, failed, storageFailed, skipped });
        continue;
      }
      try {
        const prepared = await prepareExposureDisplay(rows[index], { signal });
        preparedBytes += prepared.displayBuffer.byteLength;
        if (!(await prepared.persistPromise)) storageFailed++;
      } catch (error) {
        if (error.name === 'AbortError') return;
        failed++;
      } finally {
        completed++;
        onProgress?.({ completed, total: rows.length, failed, storageFailed, skipped });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, next));
  return { completed, total: rows.length, failed, storageFailed, skipped };
}

export async function recommendedPreloadBudget() {
  const hardLimit = 256 * 1024 * 1024;
  try {
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    if (!estimate?.quota) return hardLimit;
    const available = Math.max(0, estimate.quota - (estimate.usage || 0));
    return Math.min(hardLimit, Math.floor(available * 0.35));
  } catch {
    return hardLimit;
  }
}
