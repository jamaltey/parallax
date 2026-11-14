import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCandidate, agreementStats } from '../src/citizen/model.js';
import { parseArchiveTable } from '../src/api/spherex.js';
import { scienceImage, extractScienceImage } from '../src/lib/fits.js';
const frame = parseArchiveTable(
  readFileSync(new URL('./fixtures/spherex-sia.tsv', import.meta.url), 'utf8')
)[0];
const mark = {
  ...frame,
  ra: 304.69,
  dec: 42.44,
  view: { ra: 304.69, dec: 42.44, fov: 1 },
  imageHash: 'a'.repeat(64),
  imageVersion: 'spherex-image-hdu-v1',
};
const candidate = {
  ra: mark.ra,
  dec: mark.dec,
  center_ra: mark.ra,
  center_dec: mark.dec,
  fov: 1,
  type: 'artifact',
  confidence: 'low',
  description: 'Unit-test fixture only',
  observations: [mark],
};
test('real reports reject demo layers, incomplete metadata, repeat frames, and one-time motion', () => {
  assert.equal(validateCandidate(candidate), candidate);
  for (const patch of [
    { isMock: true },
    { product: 'mosaic' },
    { obsId: 'fabricated' },
    { imageHash: '' },
    { observedAt: null },
    { wavelengthMin: 0 },
  ])
    assert.throws(() => validateCandidate({ ...candidate, observations: [{ ...mark, ...patch }] }));
  assert.throws(() => validateCandidate({ ...candidate, observations: [mark, mark] }));
  assert.throws(() => validateCandidate({ ...candidate, type: 'moving' }));
  assert.throws(() => validateCandidate({ ...candidate, observations: [{ ...mark, ra: 360 }] }));
});
test('agreement excludes unsure votes and has no zero-score default', () => {
  assert.equal(agreementStats([]).agreement, null);
  assert.equal(agreementStats([{ verdict: 'unsure' }]).agreement, null);
  assert.deepEqual(
    agreementStats([{ verdict: 'agree' }, { verdict: 'disagree' }, { verdict: 'unsure' }]),
    { total: 3, agree: 1, disagree: 1, unsure: 1, agreement: 50 }
  );
});
function testImage(header) {
  const cards = Object.entries(header)
    .filter(([k, v]) => k.length <= 8 && ['number', 'boolean', 'string'].includes(typeof v))
    .map(([k, v]) =>
      `${k.padEnd(8)}= ${typeof v === 'string' ? `'${v}'` : typeof v === 'boolean' ? (v ? 'T' : 'F') : v}`
        .padEnd(80)
        .slice(0, 80)
    );
  const text = [...cards, 'END'.padEnd(80)].join('');
  const offset = Math.ceil(text.length / 2880) * 2880;
  const bytes = new Uint8Array(
    offset + Math.ceil((header.NAXIS1 * header.NAXIS2 * 4) / 2880) * 2880
  );
  bytes.fill(32, 0, offset);
  bytes.set(new TextEncoder().encode(text));
  return { buffer: bytes.buffer, offset };
}
test('TAN-SIP footprint maps the official tutorial coordinate to its science-image pixel', () => {
  const header = JSON.parse(
    readFileSync(new URL('./fixtures/spherex-image-header.json', import.meta.url))
  );
  const { buffer, offset } = testImage(header);
  const image = scienceImage(buffer);
  const [x, y] = image.pixelAt(304.693508808, 42.4436872991);
  assert.ok(Math.abs(x - 360.247645) < 1e-3);
  assert.ok(Math.abs(y - 1947.282363) < 1e-3);
  assert.equal(image.contains(304.693508808, 42.4436872991), true);
  assert.equal(image.contains(0, 0), false);
  new DataView(buffer).setFloat32(
    offset + (Math.round(y) * header.NAXIS1 + Math.round(x)) * 4,
    NaN,
    false
  );
  assert.equal(image.contains(304.693508808, 42.4436872991), false);
  assert.throws(() => extractScienceImage(new ArrayBuffer(100)), /header/);
});
