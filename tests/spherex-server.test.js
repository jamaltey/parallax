import test from 'node:test';
import assert from 'node:assert/strict';
import { spherexRoute } from '../server/spherex.js';
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
