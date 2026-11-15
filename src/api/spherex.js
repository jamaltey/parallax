import { validatePosition } from '../lib/coordinates.js';

export const SPHEREX_HIPS = 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube';
export const SPHEREX_TUTORIAL = 'https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/';
export const SPHEREX_CUBE_TUTORIAL =
  'https://caltech-ipac.github.io/irsa-tutorials/spherex-hipscube/';
export const SPHEREX_DATA_EXPLORER = 'https://irsa.ipac.caltech.edu/applications/spherex/';
export const SPHEREX_COLLECTIONS = ['spherex_dr1', 'spherex_qr3'];

export function parseCubeProperties(text) {
  const properties = Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter(line => line.trim() && !line.trim().startsWith('#') && line.includes('='))
      .map(line => {
        const split = line.indexOf('=');
        return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
      })
  );
  const wavelengths = (properties.data_cube_crval3_arr || '').split(/\s+/).map(Number);
  if (
    Number(properties.hips_cube_depth) !== 102 ||
    wavelengths.length !== 102 ||
    wavelengths.some(n => !Number.isFinite(n) || n <= 0)
  ) {
    throw new Error('IRSA returned an unsupported SPHEREx cube definition.');
  }
  const emMin = Number(properties.em_min);
  const emMax = Number(properties.em_max);
  if (!(emMin > 0 && emMax > emMin)) throw new Error('Invalid cube frequency bounds.');
  return {
    emMin,
    emMax,
    title: properties.obs_title,
    releaseDate: properties.hips_release_date,
    channels: wavelengths.map((wavelength, index) => ({
      index,
      wavelength,
      band: Math.floor(index / 17) + 1,
      channel: (index % 17) + 1,
      // IRSA documents these two dichroic channels as blank.
      blank: index === 50 || index === 51,
    })),
  };
}

export async function getSpherexCube({ signal } = {}) {
  const response = await fetch(`${SPHEREX_HIPS}/properties`, { signal });
  if (!response.ok) throw new Error(`IRSA cube metadata request failed (${response.status}).`);
  return parseCubeProperties(await response.text());
}

export function archiveSearchUrl(position, collection = 'spherex_dr1') {
  validatePosition(position);
  if (!SPHEREX_COLLECTIONS.includes(collection)) throw new Error('Unsupported SPHEREx collection.');
  const url = new URL('https://irsa.ipac.caltech.edu/SIA');
  url.search = new URLSearchParams({
    COLLECTION: collection,
    POS: `CIRCLE ${position.ra} ${position.dec} ${1 / 3600}`,
    RESPONSEFORMAT: 'TSV',
    MAXREC: '50',
  }).toString();
  return url.href;
}

export function officialExplorerUrl(position) {
  validatePosition(position);
  const url = new URL(SPHEREX_DATA_EXPLORER);
  url.search = new URLSearchParams({
    api: 'spectral-images',
    ra: String(position.ra),
    dec: String(position.dec),
    sr: '1s',
  }).toString();
  return url.href;
}

export function archiveTapRequest(position, collection = 'spherex_dr1') {
  validatePosition(position);
  if (!SPHEREX_COLLECTIONS.includes(collection)) throw new Error('Unsupported SPHEREx collection.');
  const release = collection === 'spherex_dr1' ? 'dr1' : 'qr3';
  const query = `SELECT TOP 50 'https://irsa.ipac.caltech.edu/' || a.uri AS access_url, p.time_bounds_lower, p.time_bounds_upper, p.energy_bandpassname, p.provenance_version FROM spherex.artifact AS a JOIN spherex.plane AS p ON a.planeid = p.planeid WHERE 1 = CONTAINS(POINT('ICRS', ${position.ra}, ${position.dec}), p.poly) AND a.uri LIKE 'ibe/data/spherex/${release}/level2/%' ORDER BY p.time_bounds_lower`;
  return {
    url: 'https://irsa.ipac.caltech.edu/TAP/sync',
    body: new URLSearchParams({
      REQUEST: 'doQuery',
      LANG: 'ADQL',
      FORMAT: 'tsv',
      MAXREC: '50',
      QUERY: query,
    }).toString(),
  };
}

// Kept as a diagnostic/export compatibility helper. The server uses a POST
// request because that is the form used by IRSA's PyVO examples and avoids
// oversized ADQL query URLs at proxies and CDNs.
export function archiveTapUrl(position, collection = 'spherex_dr1') {
  const request = archiveTapRequest(position, collection);
  const url = new URL(request.url);
  url.search = new URLSearchParams({
    REQUEST: 'doQuery',
    LANG: 'ADQL',
    FORMAT: 'tsv',
    MAXREC: '50',
    QUERY: new URLSearchParams(request.body).get('QUERY'),
  }).toString();
  return url.href;
}

export function parseArchiveTable(text) {
  const lines = text.trim().split(/\r?\n/);
  const fields = lines.shift().split('\t');
  if (
    !['access_url', 'obs_id', 't_min', 'energy_bandpassname'].every(name => fields.includes(name))
  ) {
    throw new Error('IRSA returned an unexpected archive table.');
  }
  return lines
    .filter(Boolean)
    .map(line => {
      const values = line.split('\t');
      const row = Object.fromEntries(fields.map((name, i) => [name, values[i] || '']));
      const url = new URL(row.access_url);
      if (
        url.origin !== 'https://irsa.ipac.caltech.edu' ||
        !url.pathname.startsWith('/ibe/data/spherex/')
      )
        throw new Error('Unexpected archive file URL.');
      const mjd = row.t_min.trim() ? Number(row.t_min) : NaN;
      const timestamp = (mjd - 40587) * 86400000;
      return {
        id: row.obs_publisher_did || url.href,
        mission: 'SPHEREx',
        product: 'spectral-exposure',
        isMock: false,
        wavelengthMin: Number(row.em_min),
        wavelengthMax: Number(row.em_max),
        processingVersion: url.pathname.match(/\/(l2b-[^/]+)\//)?.[1],
        timeMjdStart: row.t_min,
        timeMjdEnd: row.t_max,
        provenance: 'NASA/SPHEREx · Caltech/IPAC IRSA SIA2',
        archiveMetadata: row,
        obsId: row.obs_id,
        band: row.energy_bandpassname,
        observedAt:
          Number.isFinite(timestamp) && Math.abs(timestamp) <= 8.64e15
            ? new Date(timestamp).toISOString()
            : null,
        url: url.href,
        sizeKB: Number(row.access_estsize) || null,
        collection: row.obs_collection,
      };
    })
    .sort((a, b) => (a.observedAt || '').localeCompare(b.observedAt || ''));
}

export async function searchSpherex(position, collection, { signal } = {}) {
  archiveSearchUrl(position, collection); // Validate before contacting the same-origin route.
  const params = new URLSearchParams({
    ra: position.ra,
    dec: position.dec,
    fov: position.fov,
    collection,
  });
  const response = await fetch(`/api/spherex-exposures?${params}`, { signal });
  if (!response.ok) {
    let message = `IRSA search failed (${response.status}). Please retry.`;
    try {
      message = (await response.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  // Where the rows came from: live IRSA (sia/tap), or a fallback while IRSA search is down.
  const header = name => response.headers.get(name) || null;
  return {
    rows: parseArchiveTable(await response.text()),
    source: header('X-Parallax-Archive-Source') || 'sia',
    savedAt: header('X-Parallax-Archive-Saved-At'),
    indexBuiltAt: header('X-Parallax-Index-Built-At'),
  };
}

// Match IRSA's own Aladin Lite 3.8.2 cube viewer: setSliceNumber steps in
// wavelength, but the renderer indexes these tiles uniformly in frequency.
// This is a transport coordinate, NOT the physical wavelength of the channel.
export function cubeFrameFrequency(cube, index) {
  if (!Number.isInteger(index) || index < 0 || index >= cube.channels.length)
    throw new Error('Invalid SPHEREx frame.');
  const low = 299792458 / cube.emMax;
  const high = 299792458 / cube.emMin;
  return low + ((index + 0.5) / cube.channels.length) * (high - low);
}
