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
  await spherexRoute({ method: 'GET', url: '/api/spherex-exposures?ra=10&dec=20&fov=1' }, res);
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
  assert.match(JSON.parse(res.body).error, /IRSA is unavailable/);
});
