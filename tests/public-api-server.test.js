import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicApiRoute, createRateLimiter } from '../server/public-api.js';

const id = '123e4567-e89b-42d3-a456-426614174000';
const observation = {
  id: 'ivo://irsa.ipac/spherex_dr1?2025W18_1B_0074_2/D1',
  obsId: '2025W18_1B_0074_2',
  observedAt: '2025-04-29T00:24:27.935Z',
  band: 'SPHEREx-D1',
  url: 'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/week/version/1/example.fits',
  collection: 'spherex_dr1',
  mission: 'SPHEREx',
  product: 'spectral-exposure',
  isMock: false,
  processingVersion: 'l2b-v27-2026-196',
  wavelengthMin: 7.455e-7,
  wavelengthMax: 1.1167e-6,
  timeMjdStart: '60794.016990',
  timeMjdEnd: '60794.018322',
  provenance: 'NASA/SPHEREx · Caltech/IPAC IRSA SIA2',
  ra: 304.69,
  dec: 42.44,
  view: { ra: 304.68, dec: 42.43, fov: 1 },
  imageHash: 'a'.repeat(64),
  imageVersion: 'spherex-image-hdu-v1',
  user_id: 'nested-private-value',
  archiveMetadata: { cloud_access: 'not public API data' },
};
const row = {
  id,
  user_id: 'private-contributor-id',
  ra: 304.69,
  dec: 42.44,
  center_ra: 304.68,
  center_dec: 42.43,
  fov: 1,
  type: 'moving',
  description: 'Fixture candidate',
  confidence: 'medium',
  status: 'unreviewed',
  created_at: '2026-11-15T08:00:00Z',
  observations: [
    observation,
    { ...observation, id: 'second', obsId: 'second', observedAt: '2025-05-01T00:00:00Z' },
  ],
  review_count: 3,
  agree_count: 1,
  disagree_count: 1,
  unsure_count: 1,
  agreement: 50,
};

function repository(overrides = {}) {
  return {
    list: async () => ({ rows: [row], total: 1 }),
    get: async candidateId => (candidateId === id ? row : null),
    stats: async () => ({
      total_candidates: 1,
      total_reviews: 3,
      candidates_awaiting_review: 0,
      candidates_with_reviews: 1,
      by_type: { moving: 1, brightness: 0, transient: 0, artifact: 0 },
    }),
    ...overrides,
  };
}

async function request(route, path, options = {}) {
  const headers = new Map();
  const req = {
    url: path,
    method: options.method || 'GET',
    headers: options.headers || {},
    socket: { remoteAddress: '127.0.0.1' },
  };
  let status = 200;
  let body = '';
  const res = {
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value));
    },
    writeHead(code, values = {}) {
      status = code;
      for (const [name, value] of Object.entries(values)) this.setHeader(name, value);
    },
    end(value = '') {
      body += value;
    },
  };
  await route(req, res, () => {
    status = 599;
  });
  return {
    status,
    headers: { get: name => headers.get(name.toLowerCase()) ?? null },
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
  };
}

test('candidate list uses safe defaults, serializes public fields, and returns pagination', async () => {
  let received;
  const route = createPublicApiRoute({
    repository: repository({
      list: async options => ((received = options), { rows: [row], total: 21 }),
    }),
  });
  const response = await request(route, '/api/v1/candidates');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(received, {
    limit: 20,
    offset: 0,
    type: null,
    status: null,
    minAgreement: null,
    minReviews: null,
    sort: 'newest',
  });
  const body = await response.json();
  assert.equal(body.data[0].observation_count, 2);
  assert.equal(body.data[0].review_statistics.agreement_percent, 50);
  assert.equal(body.pagination.has_more, true);
  assert.doesNotMatch(JSON.stringify(body), /user_id|private-contributor|cloud_access/);
});

test('candidate list supports bounded filters, maximum limit, and stable sort selection', async () => {
  let received;
  const route = createPublicApiRoute({
    repository: repository({
      list: async options => ((received = options), { rows: [], total: 0 }),
    }),
  });
  const response = await request(
    route,
    '/api/v1/candidates?limit=100&offset=20&type=artifact&status=needs_investigation&min_agreement=75.5&min_reviews=2&sort=most_reviewed'
  );
  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    limit: 100,
    offset: 20,
    type: 'artifact',
    status: 'needs_investigation',
    minAgreement: 75.5,
    minReviews: 2,
    sort: 'most_reviewed',
  });
  assert.deepEqual((await response.json()).data, []);
});

test('candidate list rejects invalid, repeated, and unsupported parameters', async () => {
  const route = createPublicApiRoute({ repository: repository() });
  for (const path of [
    '/api/v1/candidates?limit=0',
    '/api/v1/candidates?limit=101',
    '/api/v1/candidates?offset=-1',
    '/api/v1/candidates?type=planet',
    '/api/v1/candidates?min_agreement=101',
    '/api/v1/candidates?sort=random',
    '/api/v1/candidates?ra=12&dec=2&radius=1',
    '/api/v1/candidates?limit=1&limit=2',
  ]) {
    const response = await request(route, path);
    assert.equal(response.status, 400, path);
    assert.equal((await response.json()).error.code, 'INVALID_PARAMETER');
  }
});

test('candidate detail preserves observation order and provenance without identities', async () => {
  const response = await request(
    createPublicApiRoute({ repository: repository() }),
    `/api/v1/candidates/${id}`
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(
    body.data.observations.map(item => item.observation_id),
    ['2025W18_1B_0074_2', 'second']
  );
  assert.equal(body.data.observations[0].original_fits_url, observation.url);
  assert.equal(body.data.observations[0].extracted_fits.sha256, 'a'.repeat(64));
  assert.equal(body.data.observations[0].marked_position.ra_degrees, 304.69);
  assert.equal(body.data.review_statistics.unsure_count, 1);
  assert.doesNotMatch(JSON.stringify(body), /user_id|nested-private|archiveMetadata/);
});

test('candidate detail validates UUIDs and returns JSON 404 for missing records', async () => {
  const route = createPublicApiRoute({ repository: repository() });
  let response = await request(route, '/api/v1/candidates/not-a-uuid');
  assert.equal(response.status, 400);
  response = await request(route, '/api/v1/candidates/123e4567-e89b-42d3-a456-426614174001');
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'NOT_FOUND');
});

test('statistics returns real repository aggregates, supports empty data, and is short-lived cached', async () => {
  let calls = 0;
  const route = createPublicApiRoute({
    repository: repository({
      stats: async () => {
        calls += 1;
        return {
          total_candidates: 0,
          total_reviews: 0,
          candidates_awaiting_review: 0,
          candidates_with_reviews: 0,
          by_type: { moving: 0, brightness: 0, transient: 0, artifact: 0 },
        };
      },
    }),
    now: () => Date.parse('2026-11-15T08:00:00Z'),
  });
  const first = await request(route, '/api/v1/stats');
  const second = await request(route, '/api/v1/stats');
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).data.by_type, {
    moving: 0,
    brightness: 0,
    transient: 0,
    artifact: 0,
  });
  assert.equal(second.status, 200);
  assert.equal(calls, 1);
});

test('OPTIONS, unsupported methods, and unknown API routes use consistent API responses', async () => {
  const route = createPublicApiRoute({ repository: repository() });
  let response = await request(route, '/api/v1/candidates', { method: 'OPTIONS' });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  response = await request(route, '/api/v1/candidates', { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, OPTIONS');
  response = await request(route, '/api/v1/unknown');
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'NOT_FOUND');
});

test('rate limiting is bounded per client and provides Retry-After', async () => {
  const route = createPublicApiRoute({
    repository: repository(),
    limiter: createRateLimiter({ limit: 1, windowMs: 60_000, maxClients: 2 }),
  });
  assert.equal((await request(route, '/api/v1/stats')).status, 200);
  const response = await request(route, '/api/v1/stats');
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('retry-after')) >= 1);
});

test('upstream failures and timeouts do not expose internal errors', async () => {
  let route = createPublicApiRoute({
    repository: repository({
      list: async () => {
        throw new Error('database password secret');
      },
    }),
  });
  let response = await request(route, '/api/v1/candidates');
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /password secret/);
  route = createPublicApiRoute({
    repository: repository({ list: async () => new Promise(() => {}) }),
    timeoutMs: 10,
  });
  response = await request(route, '/api/v1/candidates');
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'UPSTREAM_TIMEOUT');
});
