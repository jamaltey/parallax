// Offline SPHEREx footprint search, used only when IRSA's SIA and TAP services are both down.
// The index is built from the real FITS headers on IRSA's public AWS mirror by
// scripts/build-spherex-index.mjs; every result points at a real IRSA exposure file.
import { readdir, readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { archiveTsv, BAND_LIMITS } from './spherex-tap.js';

const RELEASES = { spherex_dr1: 'dr1', spherex_qr3: 'qr3' };
const RAD = Math.PI / 180;
// Exact test: linear TAN + the detector's SIP distortion (constant to < 0.8 px between
// exposures), and for D4–D6 the rigid twin transform from D1–D3 (~0.2 px). 1 px covers both.
const EDGE_TOLERANCE_PX = 1;
// Skip the SIP iteration for points clearly off the chip (SIP shifts are ≤ ~10 px).
const LINEAR_REJECT_PX = 40;
// Cheap angular prefilter: wider than half the diagonal of a 3.5° detector.
const COS_PREFILTER = Math.cos(3.2 * RAD);
const MAX_ROWS = 50; // same cap as the SIA (MAXREC) and TAP (TOP) queries
const FORMAT = 2;

let indexDir = process.env.SPHEREX_INDEX_DIR || path.resolve('data/spherex-index');
const loaded = new Map();

export function setIndexDir(dir) {
  indexDir = dir;
  loaded.clear();
}

const flatTerms = terms => Float64Array.from((terms || []).flat());

function compile(collection, periods) {
  const obs = [];
  const footprints = [];
  // Per period: SIP terms per detector and twin transforms per detector pair.
  const calibration = periods.map(period => ({
    sip: Object.fromEntries(
      Object.entries(period.sip || {}).map(([d, { A, B }]) => [
        d,
        { A: flatTerms(A), B: flatTerms(B) },
      ])
    ),
    twins: period.twins || {},
  }));
  periods.forEach((period, periodRef) => {
    for (const [version, obsId, mjdBeg, mjdEnd, flags, nonSurvey, mask, ...fps] of period.obs) {
      // App collections are the wide surveys; deep-field and non-survey frames live in the same
      // folders but belong to separate IRSA collections (e.g. spherex_dr1_deep).
      if (nonSurvey || !String(flags).split(',').includes('all_sky')) continue;
      const ref = obs.push({ period: period.period, version, obsId, mjdBeg, mjdEnd, mask }) - 1;
      for (const fp of fps) if (fp) footprints.push({ ref, periodRef, fp });
    }
  });
  const n = footprints.length;
  const f = () => new Float64Array(n);
  const index = {
    collection,
    release: RELEASES[collection],
    obs,
    calibration,
    x: f(),
    y: f(),
    z: f(),
    ra0: f(),
    sinDec0: f(),
    cosDec0: f(),
    inv: new Float64Array(n * 4),
    crpix1: f(),
    crpix2: f(),
    nx: f(),
    ny: f(),
    ref: new Uint32Array(n),
    periodRef: new Uint32Array(n),
    detector: new Uint8Array(n),
    periods: periods.length,
    builtAt:
      periods
        .map(p => p.builtAt)
        .sort()
        .at(-1) || null,
  };
  footprints.forEach(({ ref, periodRef, fp }, i) => {
    const [ra, dec, cd11, cd12, cd21, cd22, crpix1, crpix2, nx, ny, detector] = fp;
    const det = cd11 * cd22 - cd12 * cd21;
    index.x[i] = Math.cos(dec * RAD) * Math.cos(ra * RAD);
    index.y[i] = Math.cos(dec * RAD) * Math.sin(ra * RAD);
    index.z[i] = Math.sin(dec * RAD);
    index.ra0[i] = ra;
    index.sinDec0[i] = Math.sin(dec * RAD);
    index.cosDec0[i] = Math.cos(dec * RAD);
    index.inv.set([cd22 / det, -cd12 / det, -cd21 / det, cd11 / det], i * 4);
    index.crpix1[i] = crpix1;
    index.crpix2[i] = crpix2;
    index.nx[i] = nx;
    index.ny[i] = ny;
    index.ref[i] = ref;
    index.periodRef[i] = periodRef;
    index.detector[i] = detector;
  });
  return index;
}

function polynomial(terms, x, y) {
  let sum = 0;
  for (let k = 0; k < terms.length; k += 3) sum += terms[k + 2] * x ** terms[k] * y ** terms[k + 1];
  return sum;
}

const inside = (x, y, nx, ny) =>
  x >= -0.5 - EDGE_TOLERANCE_PX &&
  y >= -0.5 - EDGE_TOLERANCE_PX &&
  x <= nx - 0.5 + EDGE_TOLERANCE_PX &&
  y <= ny - 0.5 + EDGE_TOLERANCE_PX;

async function read(collection, dir) {
  const folder = path.join(dir, collection);
  const files = (await readdir(folder)).filter(name => name.endsWith('.json.gz')).sort();
  if (!files.length) return null;
  const periods = [];
  for (const name of files) {
    const data = JSON.parse(gunzipSync(await readFile(path.join(folder, name))).toString('utf8'));
    if (data.format !== FORMAT || data.collection !== collection) continue;
    periods.push(data);
  }
  return periods.length ? compile(collection, periods) : null;
}

/** Test hook: compile period objects directly, without reading files. */
export const compileForTests = compile;

/** Resolves to the in-memory index for a collection, or null if none has been built. */
export function loadIndex(collection) {
  if (!RELEASES[collection]) return Promise.resolve(null);
  const key = `${indexDir}|${collection}`;
  if (!loaded.has(key)) {
    const pending = read(collection, indexDir).catch(() => null);
    loaded.set(key, pending);
    // "No index yet" is not remembered, so an index built while the server runs is picked up.
    pending.then(index => index || loaded.delete(key));
  }
  return loaded.get(key);
}

function exposureRow(index, obs, detector) {
  const { release, collection } = index;
  const url = `https://irsa.ipac.caltech.edu/ibe/data/spherex/${release}/level2/${obs.period}/${obs.version}/${detector}/level2_${obs.obsId}D${detector}_spx_${obs.version}.fits`;
  const band = `SPHEREx-D${detector}`;
  const [emMin, emMax] = BAND_LIMITS[band];
  return {
    access_url: url,
    obs_id: obs.obsId,
    t_min: obs.mjdBeg,
    t_max: obs.mjdEnd,
    energy_bandpassname: band,
    em_min: emMin,
    em_max: emMax,
    obs_collection: collection,
    obs_publisher_did: `ivo://irsa.ipac/${collection}?${obs.obsId}/D${detector}`,
    access_format: 'image/fits',
    provenance_version: obs.version,
  };
}

function timeSpreadRows(rows, limit = MAX_ROWS) {
  if (rows.length <= limit) return rows;
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.energy_bandpassname) || [];
    group.push(row);
    groups.set(row.energy_bandpassname, group);
  }
  const orderedGroups = [...groups.values()].sort((a, b) => b.length - a.length);
  const base = Math.floor(limit / orderedGroups.length);
  let remainder = limit % orderedGroups.length;
  const result = [];
  for (const group of orderedGroups) {
    const quota = Math.min(group.length, base + (remainder-- > 0 ? 1 : 0));
    if (quota === 1) result.push(group[0]);
    else
      for (let index = 0; index < quota; index++)
        result.push(group[Math.round((index * (group.length - 1)) / (quota - 1))]);
  }
  return result.sort((a, b) => a.t_min - b.t_min || a.access_url.localeCompare(b.access_url));
}

/** Exposures whose detector footprint contains (ra, dec), time-spread per detector, max 50. */
export function searchIndex(index, ra, dec) {
  const sinDec = Math.sin(dec * RAD);
  const cosDec = Math.cos(dec * RAD);
  const px = cosDec * Math.cos(ra * RAD);
  const py = cosDec * Math.sin(ra * RAD);
  const pz = sinDec;
  const rows = [];
  for (let i = 0; i < index.ref.length; i++) {
    const cosDistance = index.x[i] * px + index.y[i] * py + index.z[i] * pz;
    if (cosDistance < COS_PREFILTER) continue;
    // Gnomonic (TAN) projection about the footprint centre; the denominator is cosDistance.
    const deltaRa = (ra - index.ra0[i]) * RAD;
    const xi = (cosDec * Math.sin(deltaRa)) / cosDistance / RAD;
    const eta =
      (sinDec * index.cosDec0[i] - cosDec * index.sinDec0[i] * Math.cos(deltaRa)) /
      cosDistance /
      RAD;
    const k = i * 4;
    // Intermediate pixel offsets from CRPIX (SIP's u, v), then a quick linear rejection.
    const u = index.inv[k] * xi + index.inv[k + 1] * eta;
    const v = index.inv[k + 2] * xi + index.inv[k + 3] * eta;
    const nx = index.nx[i];
    const ny = index.ny[i];
    const crpix1 = index.crpix1[i];
    const crpix2 = index.crpix2[i];
    if (
      u + crpix1 - 1 < -LINEAR_REJECT_PX ||
      v + crpix2 - 1 < -LINEAR_REJECT_PX ||
      u + crpix1 - 1 > nx + LINEAR_REJECT_PX ||
      v + crpix2 - 1 > ny + LINEAR_REJECT_PX
    )
      continue;
    // Undo SIP distortion: solve u = x + A(x, y), v = y + B(x, y) by fixed-point iteration.
    const detector = index.detector[i];
    const { sip, twins } = index.calibration[index.periodRef[i]];
    const terms = sip[detector];
    let x = u;
    let y = v;
    if (terms)
      for (let iteration = 0; iteration < 20; iteration++) {
        const nextX = u - polynomial(terms.A, x, y);
        const nextY = v - polynomial(terms.B, x, y);
        const delta = Math.abs(nextX - x) + Math.abs(nextY - y);
        x = nextX;
        y = nextY;
        if (delta < 1e-3) break;
      }
    const pixelX = x + crpix1 - 1; // 0-based pixel coordinates
    const pixelY = y + crpix2 - 1;
    const obs = index.obs[index.ref[i]];
    const has = d => obs.mask & (1 << (d - 1));
    if (has(detector) && inside(pixelX, pixelY, nx, ny))
      rows.push(exposureRow(index, obs, detector));
    // D4–D6 see the same sky as D1–D3 through a rigid, fitted pixel transform.
    const twin = detector + 3;
    const t = twins[detector];
    if (detector <= 3 && t && has(twin)) {
      const twinX = t[0] * pixelX + t[1] * pixelY + t[2];
      const twinY = t[3] * pixelX + t[4] * pixelY + t[5];
      if (inside(twinX, twinY, nx, ny)) rows.push(exposureRow(index, obs, twin));
    }
  }
  rows.sort((a, b) => a.t_min - b.t_min || a.access_url.localeCompare(b.access_url));
  return timeSpreadRows(rows);
}

/** SIA-shaped TSV for the frontend, or null when no index exists for this collection. */
export async function indexArchiveTable(position, collection) {
  const index = await loadIndex(collection);
  if (!index) return null;
  return {
    text: archiveTsv(searchIndex(index, position.ra, position.dec)),
    periods: index.periods,
    builtAt: index.builtAt,
  };
}
