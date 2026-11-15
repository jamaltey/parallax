import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { resetArchiveState, spherexRoute } from '../server/spherex.js';
import { setIndexDir } from '../server/spherex-index.js';

// Every test gets an empty disk cache, no offline index, a closed circuit breaker.
beforeEach(() => {
  resetArchiveState({ cacheDirectory: mkdtempSync(path.join(tmpdir(), 'spherex-cache-')) });
  setIndexDir(mkdtempSync(path.join(tmpdir(), 'spherex-index-')));
});

// Real index data for DR1 observation 2025W18_1B_0074_2 (D1–D6, with SIP and twin transforms),
// plus a deep-field copy at the same spot that must never appear in wide-survey results.
const FIXTURE = readFileSync(new URL('./fixtures/spherex-index-2025W18_1B.json', import.meta.url));
function writeIndex() {
  const dir = mkdtempSync(path.join(tmpdir(), 'spherex-index-'));
  mkdirSync(path.join(dir, 'spherex_dr1'));
  writeFileSync(path.join(dir, 'spherex_dr1', '2025W18_1B.json.gz'), gzipSync(FIXTURE));
  setIndexDir(dir);
}
const offline = async () => {
  throw new Error('IRSA down');
};
const search = async query => {
  const res = response();
  await spherexRoute({ method: 'GET', url: `/api/spherex-exposures?${query}` }, res);
  return res;
};
function response() {
  return {
    status: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    writeHead(status, headers = {}) {
      this.status = status;
      Object.assign(this.headers, headers);
    },
    end(body) {
      this.body = body;
    },
    on() {},
    destroyed: false,
  };
}
test('archive route rejects missing, invalid, and arbitrary upstream parameters', async () => {
  for (const query of [
    'ra=0&fov=1',
    'ra=360&dec=0&fov=1',
    'ra=0&dec=0&fov=1&collection=https://example.com',
  ]) {
    const res = response();
    await spherexRoute({ method: 'GET', url: `/api/spherex-exposures?${query}` }, res);
    assert.equal(res.status, 400);
  }
  const res = response();
  await spherexRoute({ method: 'POST', url: '/api/spherex-exposures' }, res);
  assert.equal(res.status, 405);
});
test('archive route fetches only the fixed IRSA service and forwards table data', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(new URL(url).origin, 'https://irsa.ipac.caltech.edu');
    assert.equal(new URL(url).searchParams.get('MAXREC'), '50');
    return new Response('obs_id\taccess_url\nexample\tfile\n', { status: 200 });
  });
  const res = response();
  await spherexRoute({ method: 'GET', url: '/api/spherex-exposures?ra=11&dec=21&fov=1' }, res);
  assert.equal(res.status, 200);
  assert.match(res.body, /^obs_id\t/);
  assert.match(res.headers['Content-Type'], /tab-separated/);
});
test('archive failures are visible and never replaced with mock observations', async t => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  const res = response();
  await spherexRoute({ method: 'GET', url: '/api/spherex-exposures?ra=10&dec=20&fov=1' }, res);
  assert.equal(res.status, 502);
  assert.match(JSON.parse(res.body).error, /SIA and TAP are both unavailable/);
});

test('archive route falls back to official IRSA TAP without changing the frontend contract', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls++;
    const parsed = new URL(url);
    if (parsed.pathname === '/SIA') return new Response('upstream failed', { status: 502 });
    assert.equal(parsed.pathname, '/TAP/sync');
    assert.equal(options.method, 'POST');
    assert.match(options.headers['Content-Type'], /form-urlencoded/);
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('MAXREC'), '50');
    assert.match(body.get('QUERY'), /spherex\.artifact/);
    return new Response(
      [
        'access_url\ttime_bounds_lower\ttime_bounds_upper\tenergy_bandpassname\tprovenance_version',
        'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W18_1B/l2b-v27-2026-196/1/level2_2025W18_1B_0074_2D1_spx_l2b-v27-2026-196.fits\t60794.016990\t60794.018322\tSPHEREx-D1\tl2b-v27-2026-196',
      ].join('\n'),
      { status: 200 }
    );
  });
  const res = response();
  await spherexRoute({ method: 'GET', url: '/api/spherex-exposures?ra=10&dec=20&fov=1' }, res);
  assert.equal(calls, 3);
  assert.equal(res.status, 200);
  assert.equal(res.headers['X-Parallax-Archive-Source'], 'tap');
  assert.match(res.body, /obs_id/);
  assert.match(res.body, /2025W18_1B_0074_2/);
});

test('when SIA and TAP are down, the offline index answers with real exposure files', async t => {
  writeIndex();
  t.mock.method(globalThis, 'fetch', offline);
  const res = await search('ra=303.877766&dec=40.548959&fov=1');
  assert.equal(res.status, 200);
  assert.equal(res.headers['X-Parallax-Archive-Source'], 'index');
  const lines = res.body.trim().split('\n');
  assert.equal(lines.length, 3, 'header plus D1 and its same-sky twin D4');
  assert.match(
    lines[1],
    /^https:\/\/irsa\.ipac\.caltech\.edu\/ibe\/data\/spherex\/dr1\/level2\/2025W18_1B\/l2b-v27-2026-196\/1\/level2_2025W18_1B_0074_2D1_spx_l2b-v27-2026-196\.fits\t/
  );
  assert.match(lines[2], /\/4\/level2_2025W18_1B_0074_2D4_spx_/);
  assert.doesNotMatch(res.body, /9999_9/, 'deep-field frames stay out of the wide collection');
});

test('the offline index returns an empty table, not an error, outside every footprint', async t => {
  writeIndex();
  t.mock.method(globalThis, 'fetch', offline);
  const res = await search('ra=120&dec=-30&fov=1');
  assert.equal(res.status, 200);
  assert.equal(res.body.trim().split('\n').length, 1);
});

test('a verified IRSA answer is reused when IRSA goes down, even after a restart', async t => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('obs_id\taccess_url\nreal\tfile\n', { status: 200 })
  );
  assert.equal((await search('ra=12&dec=22&fov=1')).headers['X-Parallax-Archive-Source'], 'sia');
  await new Promise(resolve => setTimeout(resolve, 50)); // let the disk write finish
  // Simulate a server restart: memory and breaker reset, the disk cache directory is kept.
  resetArchiveState();
  t.mock.method(globalThis, 'fetch', offline);
  const res = await search('ra=12&dec=22&fov=1');
  assert.equal(res.status, 200);
  assert.equal(res.headers['X-Parallax-Archive-Source'], 'cache');
  assert.match(res.body, /real\tfile/);
});

test('after a confirmed outage, searches skip IRSA briefly and fail fast', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new Error('IRSA down');
  });
  assert.equal((await search('ra=13&dec=23&fov=1')).status, 502);
  const before = calls;
  assert.equal((await search('ra=14&dec=24&fov=1')).status, 502);
  assert.equal(calls, before, 'circuit breaker open: no new IRSA requests');
});

test('offline index matches exact SIP footprints to within a pixel at the detector edges', async () => {
  const { celestialWcs } = await import('../src/lib/wcs.js');
  const { compileForTests, searchIndex } = await import('../server/spherex-index.js');
  const period = JSON.parse(FIXTURE);
  const [ra, dec, cd11, cd12, cd21, cd22, crpix1, crpix2, nx, ny] = period.obs[0][7];
  const header = {
    CTYPE1: 'RA---TAN-SIP',
    CTYPE2: 'DEC--TAN-SIP',
    CRVAL1: ra,
    CRVAL2: dec,
    CD1_1: cd11,
    CD1_2: cd12,
    CD2_1: cd21,
    CD2_2: cd22,
    CRPIX1: crpix1,
    CRPIX2: crpix2,
    A_ORDER: 3,
    B_ORDER: 3,
  };
  for (const [axis, terms] of Object.entries(period.sip[1]))
    for (const [i, j, value] of terms) header[`${axis}_${i}_${j}`] = value;
  const wcs = celestialWcs(header);
  const index = compileForTests('spherex_dr1', [period]);
  const hasD1 = (x, y) =>
    searchIndex(index, ...wcs.pixelToWorld(x, y)).some(
      row => row.obs_id === '2025W18_1B_0074_2' && row.energy_bandpassname === 'SPHEREx-D1'
    );
  const mid = (nx - 1) / 2;
  for (const [x, y] of [
    [mid, 2.5],
    [mid, ny - 3.5],
    [2.5, mid],
    [nx - 3.5, mid],
    [2.5, 2.5],
  ])
    assert.ok(hasD1(x, y), `3 px inside the edge at (${x}, ${y}) must be found`);
  for (const [x, y] of [
    [mid, -5.5],
    [mid, ny + 4.5],
    [-5.5, mid],
    [nx + 4.5, mid],
    [-5.5, -5.5],
  ])
    assert.ok(!hasD1(x, y), `5 px outside the edge at (${x}, ${y}) must not be found`);
});
