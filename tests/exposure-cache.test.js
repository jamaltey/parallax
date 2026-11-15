import assert from 'node:assert/strict';
import test from 'node:test';
import { ExposureCache, exposureCacheKey } from '../src/lib/exposureCache.js';

test('exposure cache retains recent entries and evicts the least recently used', () => {
  const cache = new ExposureCache(2);
  cache.set('a', { value: 1 });
  cache.set('b', { value: 2 });
  assert.equal(cache.get('a').value, 1);
  cache.set('c', { value: 3 });
  assert.equal(cache.peek('b'), null);
  assert.equal(cache.peek('a').value, 1);
  assert.equal(cache.peek('c').value, 3);
});

test('exposure cache adds a display image without discarding validated science data', () => {
  const cache = new ExposureCache(2);
  const buffer = new ArrayBuffer(8);
  cache.set('observation', { buffer, imageHash: 'abc' });
  cache.update('observation', { displayBuffer: new ArrayBuffer(4) });
  const entry = cache.get('observation');
  assert.equal(entry.buffer, buffer);
  assert.equal(entry.imageHash, 'abc');
  assert.equal(entry.displayBuffer.byteLength, 4);
});

test('exposure cache keys include collection, identity, and original provenance URL', () => {
  const base = { collection: 'spherex_dr1', id: 'one', url: 'https://example.test/one.fits' };
  assert.notEqual(exposureCacheKey(base), exposureCacheKey({ ...base, id: 'two' }));
  assert.notEqual(exposureCacheKey(base), exposureCacheKey({ ...base, collection: 'spherex_qr3' }));
  assert.notEqual(exposureCacheKey(base), exposureCacheKey({ ...base, url: 'https://other.test' }));
});
