import assert from 'node:assert/strict';
import test from 'node:test';
import { getObservations, validateResponse } from '../src/api/observations.js';
import { validatePosition } from '../src/lib/coordinates.js';

const query = { ra: 83.633, dec: 22.0145, fov: 2, band: 'demo-short' };
test('mock contract is explicit, sorted, and changes with requested band', async () => {
  const rows = await getObservations(query, { mode: 'mock' });
  assert.equal(rows.length, 8);
  assert.ok(
    rows.every(row => row.isMock && row.provenance.includes('Synthetic') && row.band === query.band)
  );
  assert.ok(rows.every((row, i) => !i || row.observedAt > rows[i - 1].observedAt));
  const other = await getObservations({ ...query, band: 'demo-long' }, { mode: 'mock' });
  assert.notEqual(rows[0].id, other[0].id);
});

test('rejects invalid coordinates and unsupported modes', async () => {
  for (const values of [{ ra: 360 }, { dec: -91 }, { fov: 0 }, { ra: NaN }])
    assert.throws(() => validatePosition({ ...query, ...values }));
  await assert.rejects(getObservations(query, { mode: 'invalid' }));
  await assert.rejects(getObservations(query, { mode: 'http', baseUrl: '' }));
});

test('rejects malformed response and duplicate IDs; accepts empty results', () => {
  assert.throws(() => validateResponse({}));
  assert.throws(() => validateResponse({ observations: [{ id: 'broken' }] }));
  const row = {
    id: '1',
    observedAt: '2025-05-15T00:00:00Z',
    band: 'demo-short',
    isMock: true,
    provenance: 'Synthetic',
  };
  assert.throws(() => validateResponse({ observations: [row, row] }));
  assert.deepEqual(validateResponse({ observations: [] }), []);
});

test('honors cancellation before serving mock data', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(getObservations(query, { mode: 'mock', signal: controller.signal }), {
    name: 'AbortError',
  });
});
