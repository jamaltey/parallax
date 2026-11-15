import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POSITION, explorerUrl, parseExplorerUrl } from '../src/lib/explorerUrl.js';

test('coordinate URLs select an ICRS position and default the field of view', () => {
  assert.deepEqual(parseExplorerUrl('?ra=269.45&dec=-4.69'), {
    position: { ra: 269.45, dec: -4.69, fov: 2 },
    embed: false,
    hasCoordinates: true,
    error: '',
  });
  assert.deepEqual(parseExplorerUrl('?ra=0&dec=-90&fov=0.01&embed=1'), {
    position: { ra: 0, dec: -90, fov: 0.01 },
    embed: true,
    hasCoordinates: true,
    error: '',
  });
});

test('missing or invalid coordinate URL values fail visibly and safely', () => {
  for (const search of [
    '?ra=10',
    '?dec=10',
    '?ra=&dec=10',
    '?ra=360&dec=0',
    '?ra=10&dec=91',
    '?ra=10&dec=2&fov=0',
  ]) {
    const result = parseExplorerUrl(search);
    assert.deepEqual(result.position, DEFAULT_POSITION);
    assert.equal(result.hasCoordinates, true);
    assert.ok(result.error.includes('starting position'));
  }
});

test('share and embed URLs use stable validated parameters', () => {
  const position = { ra: 83.633, dec: 22.0145, fov: 1.5 };
  assert.equal(
    explorerUrl(position),
    'https://parallax.dcephei.earth/?ra=83.633&dec=22.0145&fov=1.5#explorer'
  );
  assert.equal(
    explorerUrl(position, { embed: true, origin: 'https://example.test' }),
    'https://example.test/?ra=83.633&dec=22.0145&fov=1.5&embed=1'
  );
  assert.throws(() => explorerUrl({ ra: -1, dec: 0, fov: 1 }));
});
