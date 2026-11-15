#!/usr/bin/env node
// Builds Parallax's offline SPHEREx footprint index from IRSA's public AWS mirror.
//
// IRSA's search services (SIA, TAP) can go down while the data files stay online. This
// script reads only the first FITS header blocks of each spectral image on the public
// s3://nasa-irsa-spherex bucket (anonymous HTTPS, no AWS account) and records where each
// exposure points, so the server can still answer "which exposures cover RA/Dec?".
//
// Detectors D4–D6 see the same sky as D1–D3 (the light is split by a dichroic), so only
// D1–D3 headers are read; D4–D6 reuse that footprint. One output file per planning period
// makes the build resumable: re-running skips finished periods unless --refresh is given.
//
// Usage:
//   node scripts/build-spherex-index.mjs --collection spherex_dr1 [--periods 2025W18_1B,...]
//     [--limit N] [--concurrency 64] [--out data/spherex-index] [--refresh]

import { mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { celestialWcs } from '../src/lib/wcs.js';

const BUCKET = 'https://nasa-irsa-spherex.s3.amazonaws.com/';
const RELEASES = { spherex_dr1: 'dr1', spherex_qr3: 'qr3' };
const HEADER_BYTES = 23040; // 8 FITS blocks: primary header + WCS/time part of the IMAGE header
const FORMAT = 2;

function options(argv) {
  const out = { concurrency: 64, out: 'data/spherex-index', refresh: false, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const [key, inline] = argv[i].replace(/^--/, '').split('=');
    const value = () => inline ?? argv[++i];
    if (key === 'collection') out.collection = value();
    else if (key === 'periods') out.periods = value().split(',').filter(Boolean);
    else if (key === 'limit') out.limit = Number(value());
    else if (key === 'concurrency') out.concurrency = Number(value());
    else if (key === 'out') out.out = value();
    else if (key === 'refresh') out.refresh = true;
    else throw new Error(`Unknown option --${key}`);
  }
  if (!RELEASES[out.collection])
    throw new Error(`--collection must be one of ${Object.keys(RELEASES).join(', ')}`);
  if (!(out.concurrency >= 1 && out.concurrency <= 256)) throw new Error('Bad --concurrency');
  return out;
}

async function retry(task, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

async function listS3(prefix, delimiter) {
  const keys = [];
  const prefixes = [];
  let token;
  do {
    const url = new URL(BUCKET);
    url.search = new URLSearchParams({
      'list-type': '2',
      prefix,
      'max-keys': '1000',
      ...(delimiter ? { delimiter } : {}),
      ...(token ? { 'continuation-token': token } : {}),
    });
    const xml = await retry(async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`S3 list ${prefix}: HTTP ${response.status}`);
      return response.text();
    });
    for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(match[1]);
    for (const match of xml.matchAll(/<Prefix>([^<]+)<\/Prefix>/g))
      if (match[1] !== prefix) prefixes.push(match[1]);
    token = /<NextContinuationToken>([^<]+)</.exec(xml)?.[1];
  } while (token);
  return { keys, prefixes };
}

/** Minimal FITS header reader: later cards override earlier ones (IMAGE ext over primary). */
export function parseHeaderCards(text) {
  const header = {};
  for (let offset = 0; offset + 80 <= text.length; offset += 80) {
    const card = text.slice(offset, offset + 80);
    let key;
    let rest;
    if (card.startsWith('HIERARCH ')) {
      const eq = card.indexOf('=');
      if (eq < 0) continue;
      key = card.slice(9, eq).trim();
      rest = card.slice(eq + 1);
    } else if (card[8] === '=') {
      key = card.slice(0, 8).trim();
      rest = card.slice(9);
    } else continue;
    rest = rest.trim();
    let value;
    if (rest.startsWith("'")) {
      const end = rest.indexOf("'", 1);
      value = rest.slice(1, end < 0 ? undefined : end).trim();
    } else {
      const raw = rest.split('/')[0].trim();
      value = raw === 'T' ? true : raw === 'F' ? false : Number(raw);
      if (typeof value === 'number' && !Number.isFinite(value)) value = raw;
    }
    header[key] = value;
  }
  return header;
}

const REQUIRED_KEYS = ['CRVAL1', 'CRVAL2', 'CRPIX1', 'CRPIX2', 'NAXIS1', 'NAXIS2', 'MJD-BEG'];

async function readRange(key, bytes) {
  return retry(async () => {
    const response = await fetch(BUCKET + key, {
      headers: { Range: `bytes=0-${bytes - 1}` },
      signal: AbortSignal.timeout(60000),
    });
    if (response.status !== 206 && response.status !== 200)
      throw new Error(`S3 ${key}: HTTP ${response.status}`);
    return parseHeaderCards(Buffer.from(await response.arrayBuffer()).toString('latin1'));
  });
}

/** Reads just enough header; if a future layout moves keys further down, reads more. */
async function readHeader(key) {
  for (const bytes of [HEADER_BYTES, HEADER_BYTES * 4]) {
    const header = await readRange(key, bytes);
    if (REQUIRED_KEYS.every(name => header[name] !== undefined)) return header;
  }
  throw new Error(`Required keywords missing from the header of ${key}`);
}

const round = (value, digits) => Number(value.toFixed(digits));

function footprint(header, key) {
  const cdelt1 = Number(header.CDELT1 ?? 1);
  const cdelt2 = Number(header.CDELT2 ?? 1);
  const values = [
    header.CRVAL1,
    header.CRVAL2,
    header.CD1_1 ?? header.PC1_1 * cdelt1,
    header.CD1_2 ?? (header.PC1_2 ?? 0) * cdelt1,
    header.CD2_1 ?? (header.PC2_1 ?? 0) * cdelt2,
    header.CD2_2 ?? header.PC2_2 * cdelt2,
    header.CRPIX1,
    header.CRPIX2,
    header.NAXIS1,
    header.NAXIS2,
  ].map(Number);
  if (!values.every(Number.isFinite) || !String(header.CTYPE1).startsWith('RA---TAN'))
    throw new Error(`Incomplete celestial WCS in ${key}`);
  const [ra, dec, ...rest] = values;
  return [
    round(ra, 6),
    round(dec, 6),
    ...rest.slice(0, 4).map(v => Number(v.toPrecision(9))),
    ...rest.slice(4),
  ];
}

/** SIP distortion terms [[i, j, value], ...]; nearly constant per detector (< 1 px apart). */
function sipTerms(header) {
  const pick = prefix =>
    Object.keys(header)
      .filter(key => new RegExp(`^${prefix}_\\d+_\\d+$`).test(key))
      .map(key => [...key.slice(2).split('_').map(Number), header[key]]);
  return { A: pick('A'), B: pick('B') };
}

/**
 * Least-squares affine map from detector `from` pixels to its same-sky twin's pixels, from one
 * observation's exact WCS pair. The focal plane is rigid, so it holds to ~0.2 px everywhere.
 * Returns [a, b, c, d, e, f] with x' = a x + b y + c, y' = d x + e y + f (0-based pixels).
 */
export function fitTwinTransform(fromHeader, toHeader) {
  const from = celestialWcs(fromHeader);
  const to = celestialWcs(toHeader);
  const samples = [];
  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 4; j++) {
      const x = (i / 4) * (fromHeader.NAXIS1 - 1);
      const y = (j / 4) * (fromHeader.NAXIS2 - 1);
      const target = to.worldToPixel(...from.pixelToWorld(x, y));
      if (target) samples.push([x, y, ...target]);
    }
  if (samples.length < 6) throw new Error('Could not fit the detector twin transform.');
  // Normal equations for [x y 1] · coeffs = target, solved once per output axis.
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const rx = [0, 0, 0];
  const ry = [0, 0, 0];
  for (const [x, y, tx, ty] of samples) {
    const row = [x, y, 1];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) m[a][b] += row[a] * row[b];
      rx[a] += row[a] * tx;
      ry[a] += row[a] * ty;
    }
  }
  const solve = rhs => {
    const det = mat =>
      mat[0][0] * (mat[1][1] * mat[2][2] - mat[1][2] * mat[2][1]) -
      mat[0][1] * (mat[1][0] * mat[2][2] - mat[1][2] * mat[2][0]) +
      mat[0][2] * (mat[1][0] * mat[2][1] - mat[1][1] * mat[2][0]);
    const d = det(m);
    return [0, 1, 2].map(
      col => det(m.map((row, r) => row.map((v, c) => (c === col ? rhs[r] : v)))) / d
    );
  };
  return [...solve(rx), ...solve(ry)];
}

async function pool(items, concurrency, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    })
  );
}

const FILE_PATTERN =
  /^[a-z0-9]+\/level2\/([^/]+)\/([^/]+)\/([1-6])\/level2_([A-Za-z0-9_]+?)D([1-6])_spx_[^/]+\.fits$/;

async function buildPeriod(collection, release, period, concurrency) {
  const { keys } = await listS3(`${release}/level2/${period}/`);
  const observations = new Map();
  for (const key of keys) {
    const match = FILE_PATTERN.exec(key);
    if (!match || match[3] !== match[5]) continue;
    const [, , version, detector, obsId] = match;
    const id = `${version}|${obsId}`;
    if (!observations.has(id)) observations.set(id, { version, obsId, keys: {} });
    observations.get(id).keys[detector] = key;
  }
  const jobs = [];
  for (const obs of observations.values()) {
    obs.mask = Object.keys(obs.keys).reduce((mask, d) => mask | (1 << (Number(d) - 1)), 0);
    obs.footprints = [null, null, null];
    for (let pair = 1; pair <= 3; pair++) {
      const key = obs.keys[pair] || obs.keys[pair + 3];
      if (key) jobs.push({ obs, pair, key, detector: obs.keys[pair] ? pair : pair + 3 });
    }
  }
  let done = 0;
  const failures = [];
  const sip = {};
  await pool(jobs, concurrency, async job => {
    try {
      const header = await readHeader(job.key);
      // Last element: which detector this WCS belongs to (D4–D6 only when its twin is missing).
      job.obs.footprints[job.pair - 1] = [...footprint(header, job.key), job.detector];
      sip[job.detector] ??= sipTerms(header);
      // Time and survey flags are shared by all detectors of one observation.
      if (job.obs.mjdBeg === undefined && Number.isFinite(header['MJD-BEG'])) {
        job.obs.mjdBeg = round(header['MJD-BEG'], 7);
        job.obs.mjdEnd = round(Number(header['MJD-END'] ?? header['MJD-BEG']), 7);
        job.obs.flags = String(header.SPS_FLAGS ?? '').trim();
        job.obs.nonSurvey = header.NON_SURVEY === true || /^t/i.test(String(header.NON_SURVEY));
      }
    } catch (error) {
      failures.push(`${job.key}: ${error.message}`);
    }
    if (++done % 500 === 0) process.stdout.write(`\r  ${period}: ${done}/${jobs.length} headers`);
  });
  process.stdout.write(`\r  ${period}: ${done}/${jobs.length} headers\n`);
  // A partial period would silently hide exposures, so only complete periods are saved.
  if (failures.length) {
    console.error(`  ${failures.length} header reads failed in ${period}; not saved. First:`);
    console.error(`  ${failures[0]}`);
    return null;
  }
  // Per detector pair: the exact twin transform and the twin's own SIP terms.
  const twins = {};
  for (let pair = 1; pair <= 3; pair++) {
    const both = [...observations.values()].find(o => o.keys[pair] && o.keys[pair + 3]);
    if (!both) continue;
    try {
      const [from, to] = await Promise.all([
        readHeader(both.keys[pair]),
        readHeader(both.keys[pair + 3]),
      ]);
      twins[pair] = fitTwinTransform(from, to).map(v => Number(v.toPrecision(10)));
      sip[pair] ??= sipTerms(from);
      sip[pair + 3] ??= sipTerms(to);
    } catch (error) {
      console.error(
        `  twin transform D${pair}->D${pair + 3} failed in ${period}: ${error.message}`
      );
      return null;
    }
  }
  const obs = [...observations.values()]
    .filter(o => o.mjdBeg !== undefined)
    .map(o => [
      o.version,
      o.obsId,
      o.mjdBeg,
      o.mjdEnd,
      o.flags,
      o.nonSurvey ? 1 : 0,
      o.mask,
      ...o.footprints,
    ]);
  return {
    format: FORMAT,
    collection,
    release,
    period,
    builtAt: new Date().toISOString(),
    files: keys.length,
    columns: [
      'version',
      'obsId',
      'mjdBeg',
      'mjdEnd',
      'flags',
      'nonSurvey',
      'detectorMask',
      'fp1',
      'fp2',
      'fp3',
    ],
    footprintColumns: [
      'ra',
      'dec',
      'cd11',
      'cd12',
      'cd21',
      'cd22',
      'crpix1',
      'crpix2',
      'naxis1',
      'naxis2',
      'detector',
    ],
    sip,
    twins,
    obs,
  };
}

async function main() {
  const opts = options(process.argv.slice(2));
  const release = RELEASES[opts.collection];
  const dir = path.join(opts.out, opts.collection);
  await mkdir(dir, { recursive: true });
  const existing = new Set(
    (await readdir(dir)).filter(f => f.endsWith('.json.gz')).map(f => f.replace('.json.gz', ''))
  );
  let periods = opts.periods;
  if (!periods) {
    const { prefixes } = await listS3(`${release}/level2/`, '/');
    periods = prefixes.map(p => p.split('/')[2]).filter(Boolean);
  }
  const todo = periods.filter(p => opts.refresh || !existing.has(p)).slice(0, opts.limit);
  console.log(
    `${opts.collection}: ${periods.length} planning periods, ${periods.length - todo.length} already indexed, building ${todo.length}`
  );
  const started = Date.now();
  let failed = 0;
  for (const [index, period] of todo.entries()) {
    const data = await buildPeriod(opts.collection, release, period, opts.concurrency);
    if (!data) {
      failed++;
      continue;
    }
    const file = path.join(dir, `${period}.json.gz`);
    await writeFile(`${file}.tmp`, gzipSync(JSON.stringify(data)));
    await rename(`${file}.tmp`, file); // atomic: a crash never leaves a half-written period
    const elapsed = (Date.now() - started) / 1000;
    const eta = (elapsed / (index + 1)) * (todo.length - index - 1);
    console.log(
      `  saved ${period}: ${data.obs.length} observations (${index + 1}/${todo.length}, ETA ${Math.round(eta / 60)} min)`
    );
  }
  if (failed) {
    console.error(`${failed} period(s) failed; re-run the same command to retry them.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
