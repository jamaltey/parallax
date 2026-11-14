import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exposureUrl } from '../supabase/functions/_shared/archive.js';
import { extractScienceImage, readHdus } from '../supabase/functions/_shared/fits.js';
import { handleSpherexExposures } from '../supabase/functions/_shared/spherexExposures.js';
import { handleSpherexImage } from '../supabase/functions/_shared/spherexImage.js';

const validExposure =
  'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W18_1B/l2b-v27-2026-196/1/level2_2025W18_1B_0074_2D1_spx_l2b-v27-2026-196.fits';
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

test('Edge archive search validates input, methods, CORS, and fixed IRSA semantics', async () => {
  const options = await handleSpherexExposures(
    new Request('https://project.supabase.co/functions/v1/spherex-exposures', {
      method: 'OPTIONS',
    })
  );
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), '*');
  assert.match(options.headers.get('access-control-allow-headers'), /apikey/);

  const method = await handleSpherexExposures(
    new Request('https://project.supabase.co/functions/v1/spherex-exposures', { method: 'POST' })
  );
  assert.equal(method.status, 405);

  for (const query of ['ra=0&fov=1', 'ra=360&dec=0&fov=1', 'ra=0&dec=0&fov=1&collection=bad']) {
    const response = await handleSpherexExposures(
      new Request(`https://project.supabase.co/functions/v1/spherex-exposures?${query}`)
    );
    assert.equal(response.status, 400);
  }

  let requested;
  const response = await handleSpherexExposures(
    new Request(
      'https://project.supabase.co/functions/v1/spherex-exposures?ra=10&dec=20&fov=2&collection=spherex_qr3'
    ),
    {
      fetchImpl: async (url, init) => {
        requested = { url: new URL(url), init };
        return new Response('obs_id\taccess_url\nexample\tfile\n');
      },
    }
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/tab-separated-values; charset=utf-8');
  assert.equal(requested.url.origin, 'https://irsa.ipac.caltech.edu');
  assert.equal(requested.url.pathname, '/SIA');
  assert.equal(requested.url.searchParams.get('COLLECTION'), 'spherex_qr3');
  assert.equal(requested.url.searchParams.get('POS'), `CIRCLE 10 20 ${1 / 3600}`);
  assert.equal(requested.url.searchParams.get('MAXREC'), '50');
  assert.equal(requested.init.redirect, 'error');
  assert.equal(requested.init.headers['User-Agent'], 'Parallax-SPHEREx/1.0');
});

test('Edge archive search exposes upstream failures and timeout without mock fallback', async () => {
  const request = new Request(
    'https://project.supabase.co/functions/v1/spherex-exposures?ra=10&dec=20&fov=2'
  );
  const failed = await handleSpherexExposures(request, {
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(failed.status, 502);
  assert.match((await failed.json()).error, /unavailable/);

  const timedOut = await handleSpherexExposures(request, {
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      ),
  });
  assert.equal(timedOut.status, 502);
  assert.match((await timedOut.json()).error, /timed out/);
});

test('exposure allowlist rejects credentials, redirects, traversal, queries, and wrong sources', () => {
  assert.equal(exposureUrl(validExposure), validExposure);
  for (const value of [
    validExposure.replace('/dr1/', '/qr2/'),
    validExposure.replace('irsa.ipac.caltech.edu', 'example.com'),
    validExposure.replace('https://', 'https://user:pass@'),
    `${validExposure}?download=1`,
    `${validExposure}#image`,
    validExposure.replace('/level2/', '/level2/../'),
    validExposure.replace('.fits', '.fit'),
  ])
    assert.throws(() => exposureUrl(value));
});

test('Edge image output is byte-identical to shared extraction and preserves pixels and WCS', async () => {
  const source = sourceFits();
  const expected = extractScienceImage(source.buffer);
  const fetchImpl = async (_url, init) => {
    assert.equal(init.redirect, 'error');
    return new Response(source, {
      headers: { 'content-type': 'application/fits', 'content-length': String(source.byteLength) },
    });
  };
  const request = new Request(
    `https://project.supabase.co/functions/v1/spherex-image?${new URLSearchParams({ url: validExposure })}`
  );
  const responses = await Promise.all(
    Array.from({ length: 3 }, () => handleSpherexImage(request.clone(), { fetchImpl }))
  );
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/fits');
    const actual = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual(actual, expected);
    assert.equal(
      createHash('sha256').update(actual).digest('hex'),
      createHash('sha256').update(expected).digest('hex')
    );
    const image = readHdus(actual.buffer)[0];
    assert.equal(image.header.CTYPE1, 'RA---TAN');
    assert.equal(new DataView(actual.buffer).getFloat32(image.dataOffset, false), 1.25);
  }
});

test('Edge image handles CORS, methods, invalid URLs, unavailable and incomplete files', async () => {
  const endpoint = 'https://project.supabase.co/functions/v1/spherex-image';
  assert.equal(
    (await handleSpherexImage(new Request(endpoint, { method: 'OPTIONS' }))).status,
    204
  );
  assert.equal((await handleSpherexImage(new Request(endpoint, { method: 'POST' }))).status, 405);
  assert.equal(
    (await handleSpherexImage(new Request(`${endpoint}?url=https://example.com/a.fits`))).status,
    400
  );

  const request = new Request(`${endpoint}?${new URLSearchParams({ url: validExposure })}`);
  const unavailable = await handleSpherexImage(request, {
    fetchImpl: async () => new Response('unavailable', { status: 503 }),
  });
  assert.equal(unavailable.status, 502);
  assert.match((await unavailable.json()).error, /IRSA 503/);

  const incomplete = await handleSpherexImage(request, {
    fetchImpl: async () => new Response(new Uint8Array(100)),
  });
  assert.equal(incomplete.status, 502);
  assert.match((await incomplete.json()).error, /header|IMAGE/);

  const timedOut = await handleSpherexImage(request, {
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      ),
  });
  assert.equal(timedOut.status, 502);
  assert.match((await timedOut.json()).error, /timed out/);
});
