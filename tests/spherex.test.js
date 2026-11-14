import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseCubeProperties,
  parseArchiveTable,
  archiveSearchUrl,
  cubeFrameFrequency,
} from '../src/api/spherex.js';
const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('live IRSA properties define exact wavelength indices and blank channels', () => {
  const cube = parseCubeProperties(fixture('spherex-properties.txt'));
  assert.equal(cube.channels.length, 102);
  assert.equal(cube.channels[62].wavelength, 3.293);
  assert.equal(cube.channels[62].band, 4);
  assert.equal(cube.channels[62].channel, 12);
  assert.deepEqual(
    cube.channels.filter(c => c.blank).map(c => c.index),
    [50, 51]
  );
  assert.throws(() => parseCubeProperties('hips_cube_depth=102'), /unsupported/);
});
test('archive query validates coordinates and constrains the request', () => {
  const url = new URL(archiveSearchUrl({ ra: 304.693508808, dec: 42.4436872991, fov: 2 }));
  assert.equal(url.searchParams.get('COLLECTION'), 'spherex_dr1');
  assert.equal(url.searchParams.get('MAXREC'), '50');
  assert.equal(url.searchParams.get('RESPONSEFORMAT'), 'TSV');
  assert.throws(() => archiveSearchUrl({ ra: NaN, dec: 0, fov: 1 }));
  assert.throws(() => archiveSearchUrl({ ra: 0, dec: 0, fov: 1 }, 'fake'));
});
test('real IRSA table retains exposure identity, detector, date, and download URL', () => {
  const text = fixture('spherex-sia.tsv');
  const rows = parseArchiveTable(text);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map(r => r.id)).size, 3);
  assert.equal(rows[0].obsId, '2025W18_1B_0074_2');
  assert.equal(rows[0].band, 'SPHEREx-D1');
  assert.match(rows[0].observedAt, /^2025-04-29T00:24:/);
  assert.match(rows[0].url, /\/dr1\/level2\/.*\.fits$/);
  assert.deepEqual(parseArchiveTable(text.split('\n')[0]), []);
  assert.throws(() => parseArchiveTable('<html>Service unavailable</html>'), /unexpected/);
  assert.throws(
    () =>
      parseArchiveTable(
        text.replaceAll('https://irsa.ipac.caltech.edu/ibe/data/spherex/', 'https://example.com/')
      ),
    /Unexpected/
  );
});

test('Aladin transport frequency resolves to the exact requested cube frame', () => {
  const cube = parseCubeProperties(fixture('spherex-properties.txt'));
  const low = 299792458 / cube.emMax;
  const high = 299792458 / cube.emMin;
  for (let frame = 0; frame < 102; frame++) {
    assert.equal(Math.floor(((cubeFrameFrequency(cube, frame) - low) / (high - low)) * 102), frame);
  }
  assert.throws(() => cubeFrameFrequency(cube, 102));
});
