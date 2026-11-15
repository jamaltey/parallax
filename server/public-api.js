import { createClient } from '@supabase/supabase-js';

const API_PREFIX = '/api/v1';
const PUBLIC_FIELDS =
  'id,ra,dec,center_ra,center_dec,fov,type,description,confidence,observations,status,created_at,review_count,agree_count,disagree_count,unsure_count,agreement';
const TYPES = ['moving', 'brightness', 'transient', 'artifact'];
const STATUSES = ['unreviewed', 'needs_investigation'];
const SORTS = ['newest', 'oldest', 'most_reviewed', 'highest_agreement'];
const DISCLAIMER =
  'Parallax candidate reports are community-generated and have not been independently scientifically validated. Community agreement does not constitute confirmation of an astronomical discovery.';
const COMMUNITY_ORIGIN = 'https://parallax.dcephei.earth';

function publicSupabase() {
  const url = process.env.VITE_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, '');
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const error = new Error('Public data service is not configured.');
    error.code = 'SERVICE_UNAVAILABLE';
    throw error;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function withSignal(query, signal) {
  return signal ? query.abortSignal(signal) : query;
}

export function createSupabasePublicRepository(clientFactory = publicSupabase) {
  let client;
  const database = () => (client ||= clientFactory());
  async function result(query) {
    const value = await query;
    if (value.error) throw value.error;
    return value;
  }
  async function count(query, signal) {
    const value = await result(withSignal(query, signal));
    return value.count ?? 0;
  }
  return {
    async list(options, signal) {
      let query = database().from('candidate_summary').select(PUBLIC_FIELDS, { count: 'exact' });
      if (options.type) query = query.eq('type', options.type);
      if (options.status) query = query.eq('status', options.status);
      if (options.minAgreement != null) query = query.gte('agreement', options.minAgreement);
      if (options.minReviews != null) query = query.gte('review_count', options.minReviews);
      if (options.sort === 'oldest') query = query.order('created_at', { ascending: true });
      else if (options.sort === 'most_reviewed')
        query = query
          .order('review_count', { ascending: false })
          .order('created_at', { ascending: false });
      else if (options.sort === 'highest_agreement')
        query = query
          .order('agreement', { ascending: false, nullsFirst: false })
          .order('review_count', { ascending: false })
          .order('created_at', { ascending: false });
      else query = query.order('created_at', { ascending: false });
      query = query
        .order('id', { ascending: true })
        .range(options.offset, options.offset + options.limit - 1);
      const value = await result(withSignal(query, signal));
      return { rows: value.data ?? [], total: value.count ?? 0 };
    },
    async get(id, signal) {
      const query = database()
        .from('candidate_summary')
        .select(PUBLIC_FIELDS)
        .eq('id', id)
        .maybeSingle();
      return (await result(withSignal(query, signal))).data;
    },
    async stats(signal) {
      const db = database();
      const [totalCandidates, totalReviews, awaiting, reviewed, ...byType] = await Promise.all([
        count(db.from('candidate_summary').select('id', { count: 'exact', head: true }), signal),
        count(db.from('classifications').select('id', { count: 'exact', head: true }), signal),
        count(
          db
            .from('candidate_summary')
            .select('id', { count: 'exact', head: true })
            .eq('review_count', 0),
          signal
        ),
        count(
          db
            .from('candidate_summary')
            .select('id', { count: 'exact', head: true })
            .gt('review_count', 0),
          signal
        ),
        ...TYPES.map(type =>
          count(
            db
              .from('candidate_summary')
              .select('id', { count: 'exact', head: true })
              .eq('type', type),
            signal
          )
        ),
      ]);
      return {
        total_candidates: totalCandidates,
        total_reviews: totalReviews,
        candidates_awaiting_review: awaiting,
        candidates_with_reviews: reviewed,
        by_type: Object.fromEntries(TYPES.map((type, index) => [type, byType[index]])),
      };
    },
  };
}

function finite(value) {
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function iso(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : null;
}

function reviewStatistics(row) {
  return {
    review_count: Number(row.review_count) || 0,
    agree_count: Number(row.agree_count) || 0,
    disagree_count: Number(row.disagree_count) || 0,
    unsure_count: Number(row.unsure_count) || 0,
    agreement_percent: row.agreement == null ? null : Number(row.agreement),
  };
}

function observationTimes(observations) {
  const values = observations
    .map(item => iso(item?.observedAt))
    .filter(Boolean)
    .sort();
  return { first: values[0] ?? null, last: values.at(-1) ?? null };
}

export function serializeObservation(item, sequence) {
  const source = item && typeof item === 'object' ? item : {};
  return {
    sequence,
    data_role: 'original_observation',
    archive_record_id: typeof source.id === 'string' ? source.id : null,
    observation_id: typeof source.obsId === 'string' ? source.obsId : null,
    mission: source.mission === 'SPHEREx' ? 'SPHEREx' : null,
    product: source.product === 'spectral-exposure' ? 'spectral-exposure' : null,
    collection: ['spherex_dr1', 'spherex_qr3'].includes(source.collection)
      ? source.collection
      : null,
    detector_band: typeof source.band === 'string' ? source.band : null,
    observed_at: iso(source.observedAt),
    original_fits_url:
      typeof source.url === 'string' && source.url.startsWith('https://irsa.ipac.caltech.edu/')
        ? source.url
        : null,
    wavelength_meters: {
      minimum: finite(source.wavelengthMin),
      maximum: finite(source.wavelengthMax),
    },
    processing_version:
      typeof source.processingVersion === 'string' ? source.processingVersion : null,
    marked_position: { ra_degrees: finite(source.ra), dec_degrees: finite(source.dec) },
    saved_view: {
      center_ra_degrees: finite(source.view?.ra),
      center_dec_degrees: finite(source.view?.dec),
      field_of_view_degrees: finite(source.view?.fov),
    },
    extracted_fits: {
      sha256: /^[a-f0-9]{64}$/.test(source.imageHash || '') ? source.imageHash : null,
      format_version: typeof source.imageVersion === 'string' ? source.imageVersion : null,
    },
    archive_time_mjd: {
      start: finite(source.timeMjdStart),
      end: finite(source.timeMjdEnd),
    },
    provenance: typeof source.provenance === 'string' ? source.provenance : null,
  };
}

function serializeSummary(row) {
  const observations = Array.isArray(row.observations) ? row.observations : [];
  const times = observationTimes(observations);
  return {
    id: row.id,
    type: row.type,
    description: row.description || '',
    confidence: row.confidence,
    status: row.status,
    created_at: iso(row.created_at),
    report_position: { ra_degrees: finite(row.ra), dec_degrees: finite(row.dec) },
    observation_count: observations.length,
    first_observed_at: times.first,
    last_observed_at: times.last,
    review_statistics: reviewStatistics(row),
    url: `${COMMUNITY_ORIGIN}/community/${row.id}`,
  };
}

function serializeCandidate(row) {
  return {
    ...serializeSummary(row),
    sky_region: {
      center_ra_degrees: finite(row.center_ra),
      center_dec_degrees: finite(row.center_dec),
      field_of_view_degrees: finite(row.fov),
    },
    observations: (Array.isArray(row.observations) ? row.observations : []).map((item, index) =>
      serializeObservation(item, index + 1)
    ),
  };
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function errorResponse(res, status, code, message, headers) {
  json(res, status, { error: { code, message } }, headers);
}

function invalid(message) {
  const error = new Error(message);
  error.code = 'INVALID_PARAMETER';
  return error;
}

function integer(params, name, fallback, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!params.has(name)) return fallback;
  const raw = params.get(name);
  if (!/^\d+$/.test(raw || '') || Number(raw) < minimum || Number(raw) > maximum)
    throw invalid(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return Number(raw);
}

function number(params, name, minimum, maximum) {
  if (!params.has(name)) return null;
  const value = Number(params.get(name));
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw invalid(`${name} must be a number between ${minimum} and ${maximum}.`);
  return value;
}

function listOptions(searchParams) {
  const allowed = new Set([
    'limit',
    'offset',
    'type',
    'status',
    'min_agreement',
    'min_reviews',
    'sort',
  ]);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key))
      throw invalid(
        `${key} is not a supported parameter. Celestial-radius filtering is not available in v1.`
      );
    if (searchParams.getAll(key).length > 1) throw invalid(`${key} may only be supplied once.`);
  }
  const type = searchParams.get('type') || null;
  const status = searchParams.get('status') || null;
  const sort = searchParams.get('sort') || 'newest';
  if (type && !TYPES.includes(type)) throw invalid(`type must be one of: ${TYPES.join(', ')}.`);
  if (status && !STATUSES.includes(status))
    throw invalid(`status must be one of: ${STATUSES.join(', ')}.`);
  if (!SORTS.includes(sort)) throw invalid(`sort must be one of: ${SORTS.join(', ')}.`);
  return {
    limit: integer(searchParams, 'limit', 20, 1, 100),
    offset: integer(searchParams, 'offset', 0, 0),
    type,
    status,
    minAgreement: number(searchParams, 'min_agreement', 0, 100),
    minReviews: integer(searchParams, 'min_reviews', null, 0),
    sort,
  };
}

function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function privateAddress(address = '') {
  const normalized = address.replace(/^::ffff:/, '');
  return (
    normalized === '::1' ||
    normalized === '127.0.0.1' ||
    normalized.startsWith('10.') ||
    normalized.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
  );
}

function clientKey(req) {
  const direct = req.socket?.remoteAddress || 'unknown';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (privateAddress(direct) && typeof forwarded === 'string')
    return forwarded.split(',').at(-1).trim().slice(0, 128) || direct;
  return direct;
}

export function createRateLimiter({ limit = 60, windowMs = 60_000, maxClients = 2_000 } = {}) {
  const clients = new Map();
  return {
    check(key, now = Date.now()) {
      for (const [client, value] of clients) if (value.reset <= now) clients.delete(client);
      let value = clients.get(key);
      if (!value || value.reset <= now) value = { count: 0, reset: now + windowMs };
      value.count += 1;
      clients.delete(key);
      clients.set(key, value);
      while (clients.size > maxClients) clients.delete(clients.keys().next().value);
      return {
        allowed: value.count <= limit,
        retryAfter: Math.max(1, Math.ceil((value.reset - now) / 1000)),
      };
    },
  };
}

async function withinTimeout(operation, timeoutMs) {
  const controller = new AbortController();
  let timeout;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          const error = new Error('Public data service timed out.');
          error.code = 'TIMEOUT';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export function createPublicApiRoute({
  repository = createSupabasePublicRepository(),
  limiter = createRateLimiter(),
  timeoutMs = 10_000,
  statsCacheMs = 30_000,
  now = () => Date.now(),
} = {}) {
  let statsCache = null;
  return async function publicApiRoute(req, res, next) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(`${API_PREFIX}/`) && url.pathname !== API_PREFIX) return next();
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Access-Control-Max-Age': '86400',
    };
    for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and OPTIONS are supported.', {
        Allow: 'GET, OPTIONS',
      });
      return;
    }
    const rate = limiter.check(clientKey(req), now());
    if (!rate.allowed) {
      errorResponse(res, 429, 'RATE_LIMITED', 'Too many requests. Please try again later.', {
        'Retry-After': String(rate.retryAfter),
      });
      return;
    }
    try {
      if (url.pathname === `${API_PREFIX}/candidates`) {
        const options = listOptions(url.searchParams);
        const result = await withinTimeout(signal => repository.list(options, signal), timeoutMs);
        json(res, 200, {
          data: result.rows.map(serializeSummary),
          pagination: {
            limit: options.limit,
            offset: options.offset,
            total: result.total,
            has_more: options.offset + result.rows.length < result.total,
          },
          meta: { scientific_disclaimer: DISCLAIMER },
        });
        return;
      }
      const detail = url.pathname.match(/^\/api\/v1\/candidates\/([^/]+)\/?$/);
      if (detail) {
        if (url.search) throw invalid('Candidate detail does not accept query parameters.');
        if (!uuid(detail[1])) throw invalid('Candidate id must be a valid UUID.');
        const row = await withinTimeout(signal => repository.get(detail[1], signal), timeoutMs);
        if (!row) {
          errorResponse(res, 404, 'NOT_FOUND', 'Candidate not found or not publicly accessible.');
          return;
        }
        json(res, 200, {
          data: serializeCandidate(row),
          meta: {
            observations:
              'Original NASA/SPHEREx archive observations; no derived image is returned.',
            classifications: 'Independent community assessments, not scientific verification.',
            scientific_disclaimer: DISCLAIMER,
          },
        });
        return;
      }
      if (url.pathname === `${API_PREFIX}/stats`) {
        if (url.search) throw invalid('Statistics does not accept query parameters.');
        const current = now();
        if (!statsCache || statsCache.expires <= current) {
          const data = await withinTimeout(signal => repository.stats(signal), timeoutMs);
          statsCache = {
            data,
            generatedAt: new Date(current).toISOString(),
            expires: current + statsCacheMs,
          };
        }
        json(res, 200, {
          data: statsCache.data,
          generated_at: statsCache.generatedAt,
          meta: { scientific_disclaimer: DISCLAIMER },
        });
        return;
      }
      errorResponse(res, 404, 'NOT_FOUND', 'API endpoint not found.');
    } catch (error) {
      if (error?.code === 'INVALID_PARAMETER')
        errorResponse(res, 400, 'INVALID_PARAMETER', error.message);
      else if (error?.code === 'TIMEOUT' || error?.name === 'AbortError')
        errorResponse(
          res,
          504,
          'UPSTREAM_TIMEOUT',
          'The public data service timed out. Please retry.'
        );
      else
        errorResponse(
          res,
          503,
          'SERVICE_UNAVAILABLE',
          'The public data service is temporarily unavailable. Please retry.'
        );
    }
  };
}

export const publicApiRoute = createPublicApiRoute();
