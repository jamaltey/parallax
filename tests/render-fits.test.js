import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFitsImage } from '../src/lib/renderFits.js';
import { readHdus } from '../src/lib/fits.js';

function fixture(sip = true) {
  const fields = {
    SIMPLE: true,
    BITPIX: -32,
    NAXIS: 2,
    NAXIS1: 5,
    NAXIS2: 5,
    CRPIX1: 3,
    CRPIX2: 3,
    CTYPE1: sip ? 'RA---TAN-SIP' : 'RA---TAN',
    CTYPE2: sip ? 'DEC--TAN-SIP' : 'DEC--TAN',
    CRVAL1: 80,
    CRVAL2: 20,
    CDELT1: -0.001,
    CDELT2: 0.001,
    A_ORDER: 2,
    B_ORDER: 2,
    A_0_0: 0.5,
    B_0_0: 0,
  };
  const cards = Object.entries(fields).map(([key, value]) =>
    (
      key.padEnd(8) +
      '= ' +
      (typeof value === 'string' ? `'${value}'` : value === true ? 'T' : value)
    ).padEnd(80)
  );
  const buffer = new ArrayBuffer(5760);
  new Uint8Array(buffer).fill(32, 0, 2880);
  new Uint8Array(buffer).set(new TextEncoder().encode(cards.join('') + 'END'.padEnd(80)));
  const view = new DataView(buffer);
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++) view.setFloat32(2880 + (y * 5 + x) * 4, x + 10 * y, false);
  return buffer;
}

test('display reprojection corrects SIP distortion while preserving the original source', () => {
  const source = fixture(),
    before = source.slice(0);
  const result = renderFitsImage(source),
    hdu = readHdus(result)[0];
  assert.deepEqual(source, before);
  assert.equal(hdu.header.CTYPE1, 'RA---TAN');
  assert.equal(hdu.header.A_ORDER, undefined);
  assert.equal(hdu.header.CRVAL1, 80);
  const view = new DataView(result);
  // A constant +0.5 pixel SIP shift means TAN pixel (2,2) samples source (1.5,2).
  assert.equal(view.getFloat32(hdu.dataOffset + (2 * 5 + 2) * 4, false), 21.5);
  assert.ok(Number.isNaN(view.getFloat32(hdu.dataOffset, false)));
});
test('undistorted images are copied without modifying pixels or headers', () => {
  const source = fixture(false);
  assert.deepEqual(renderFitsImage(source), source);
});
