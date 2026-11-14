import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exposureRoute, exposureUrl } from '../server/exposure.js';
import { extractScienceImage, readHdus } from '../src/lib/fits.js';

const sourceUrl = suffix =>
  `https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W18_1B/l2b-v27-2026-196/1/${suffix}.fits`;
const card = (key, value) =>
  `${key.padEnd(8)}= ${typeof value === 'string' ? `'${value}'` : String(value)}`.padEnd(80);
const header = cards => {
  const text = [...cards, 'END'.padEnd(80)].join('');
  return text.padEnd(Math.ceil(text.length / 2880) * 2880, ' ');
};

function sourceFits() {
  const primary = header([card('SIMPLE', 'T'), card('BITPIX', 8), card('NAXIS', 0)]);
  const image = header([
    card('XTENSION', 'IMAGE'),
    card('BITPIX', -32),
    card('NAXIS', 2),
    card('NAXIS1', 2),
    card('NAXIS2', 2),
    card('PCOUNT', 0),
    card('GCOUNT', 1),
    card('EXTNAME', 'IMAGE'),
    card('CTYPE1', 'RA---TAN'),
    card('CTYPE2', 'DEC--TAN'),
    card('CRVAL1', 10),
    card('CRVAL2', 20),
    card('CRPIX1', 1),
    card('CRPIX2', 1),
    card('CDELT1', -0.001),
    card('CDELT2', 0.001),
  ]);
  const bytes = new Uint8Array(2880 * 3);
  bytes.fill(32);
  bytes.set(new TextEncoder().encode(primary));
  bytes.set(new TextEncoder().encode(image), 2880);
  const view = new DataView(bytes.buffer);
  [1.25, -2.5, 3.75, 4.5].forEach((value, index) =>
    view.setFloat32(5760 + index * 4, value, false)
  );
  return bytes;
}

function response() {
  return {
    status: 200,
    headers: {},
    destroyed: false,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    writeHead(status, headers = {}) {
      this.status = status;
      Object.assign(this.headers, headers);
    },
    end(body) {
      this.body = body;
    },
    on() {},
  };
}

async function callImage(url) {
  const res = response();
  await exposureRoute(
    { method: 'GET', url: `/api/spherex-image?${new URLSearchParams({ url })}` },
    res
  );
  return res;
}

test('exposure allowlist rejects credentials, traversal, queries, and unsupported sources', () => {
  const valid = sourceUrl('valid');
  assert.equal(exposureUrl(valid), valid);
  for (const value of [
    valid.replace('/dr1/', '/qr2/'),
    valid.replace('irsa.ipac.caltech.edu', 'example.com'),
    valid.replace('https://', 'https://user:pass@'),
    `${valid}?download=1`,
    `${valid}#image`,
    valid.replace('/level2/', '/level2/../'),
    valid.replace('.fits', '.fit'),
  ])
    assert.throws(() => exposureUrl(value));
});

test('image route requests a validated range and preserves FITS bytes, WCS, and pixels', async t => {
  const source = sourceFits();
  const expected = extractScienceImage(source.buffer);
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Range, 'bytes=0-18874367');
    return new Response(source, {
      status: 206,
      headers: {
        'content-range': `bytes 0-${source.byteLength - 1}/${source.byteLength}`,
        'content-length': String(source.byteLength),
      },
    });
  });
  const res = await callImage(sourceUrl('range-test'));
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'application/fits');
  assert.deepEqual(res.body, expected);
  assert.equal(
    createHash('sha256').update(res.body).digest('hex'),
    createHash('sha256').update(expected).digest('hex')
  );
  const image = readHdus(res.body.buffer)[0];
  assert.equal(image.header.CTYPE1, 'RA---TAN');
  assert.equal(new DataView(res.body.buffer).getFloat32(image.dataOffset, false), 1.25);
});

test('image route safely falls back when IRSA ignores Range', async t => {
  const source = sourceFits();
  t.mock.method(globalThis, 'fetch', async () => new Response(source, { status: 200 }));
  const res = await callImage(sourceUrl('range-ignored'));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, extractScienceImage(source.buffer));
});

test('image route rejects malformed or incomplete ranged responses', async t => {
  const source = sourceFits();
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(source, {
        status: 206,
        headers: {
          'content-range': `bytes 1-${source.byteLength}/${source.byteLength + 1}`,
          'content-length': String(source.byteLength),
        },
      })
  );
  const res = await callImage(sourceUrl('bad-range'));
  assert.equal(res.status, 502);
  assert.match(JSON.parse(res.body).error, /Content-Range/);
});
