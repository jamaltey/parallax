import assert from 'node:assert/strict';
import test from 'node:test';
import {
  objectLookupRequest,
  objectLookupRoute,
  parseSimbadTsv,
  simbadQuery,
} from '../server/objects.js';

function response() {
  return {
    status: 200,
    headers: {},
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

test('object lookup validates coordinates, radius, and method', async () => {
  for (const query of [
    'dec=0&radius=0.01',
    'ra=360&dec=0&radius=0.01',
    'ra=10&dec=-91&radius=0.01',
    'ra=10&dec=20&radius=0.2',
    'ra=10&dec=20&radius=0',
  ]) {
    const res = response();
    await objectLookupRoute({ method: 'GET', url: `/api/object-lookup?${query}` }, res);
    assert.equal(res.status, 400);
  }
  const res = response();
  await objectLookupRoute({ method: 'POST', url: '/api/object-lookup' }, res);
  assert.equal(res.status, 405);
});

test('object lookup query contains only validated numeric cone parameters', () => {
  const coordinates = objectLookupRequest(
    new URL('http://localhost/api/object-lookup?ra=83.6331&dec=22.0145&radius=0.03')
  );
  const query = simbadQuery(coordinates);
  assert.match(query, /CIRCLE\('ICRS', 83\.6331, 22\.0145, 0\.03\)/);
  assert.match(query, /ORDER BY separation ASC$/);
});

test('object lookup falls back from Harvard to IDIA and parses a match', async t => {
  const hosts = [];
  t.mock.method(globalThis, 'fetch', async url => {
    hosts.push(new URL(url).host);
    if (hosts.length === 1) return new Response('offline', { status: 503 });
    return new Response(
      'main_id\tra\tdec\totype\tsp_type\tseparation\n"V* CM Tau"\t83.633114\t22.014487\t"Psr"\t\t0.0000185\n',
      { status: 200 }
    );
  });
  const res = response();
  await objectLookupRoute(
    { method: 'GET', url: '/api/object-lookup?ra=83.6331&dec=22.0145&radius=0.03' },
    res
  );
  assert.deepEqual(hosts, ['simbad.cfa.harvard.edu', 'simbad.idia.ac.za']);
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.name, 'V* CM Tau');
  assert.equal(body.provider, 'IDIA SIMBAD mirror');
  assert.match(body.objectUrl, /^https:\/\/simbad\.idia\.ac\.za\//);
});

test('successful empty mirror response is distinguished from an outage', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response('main_id\tra\tdec\totype\tsp_type\tseparation\n', { status: 200 });
  });
  const res = response();
  await objectLookupRoute(
    { method: 'GET', url: '/api/object-lookup?ra=10&dec=20&radius=0.01' },
    res
  );
  assert.equal(calls, 1);
  assert.equal(res.status, 404);
  assert.equal(JSON.parse(res.body).noMatch, true);
});

test('all unavailable mirrors return a visible 502 without fabricated objects', async t => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  const res = response();
  await objectLookupRoute(
    { method: 'GET', url: '/api/object-lookup?ra=10&dec=20&radius=0.01' },
    res
  );
  assert.equal(res.status, 502);
  assert.match(JSON.parse(res.body).error, /Harvard and IDIA/);
});

test('SIMBAD TSV parser rejects malformed rows', () => {
  assert.equal(parseSimbadTsv('main_id\tra\tdec\totype\tsp_type\tseparation\n'), null);
  assert.throws(
    () =>
      parseSimbadTsv('main_id\tra\tdec\totype\tsp_type\tseparation\nname\tbad\t1\tStar\t\t0.1\n'),
    /invalid table/
  );
});
