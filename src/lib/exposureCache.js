export const MAX_CACHED_EXPOSURES = 6;

export class ExposureCache {
  constructor(limit = MAX_CACHED_EXPOSURES) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Cache limit must be positive.');
    this.limit = limit;
    this.entries = new Map();
  }

  get(key) {
    const value = this.entries.get(key);
    if (!value) return null;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  peek(key) {
    return this.entries.get(key) || null;
  }

  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
    return value;
  }

  update(key, values) {
    const current = this.entries.get(key);
    if (!current) return null;
    return this.set(key, { ...current, ...values });
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

export function exposureCacheKey(exposure) {
  return `${exposure.collection}:${exposure.id}:${exposure.url}`;
}

export const exposureCache = new ExposureCache();
