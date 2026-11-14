import { validatePosition } from '../lib/coordinates.js';

export const SPHEREX_HIPS = 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube';
export const SPHEREX_TUTORIAL = 'https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/';
export const SPHEREX_CUBE_TUTORIAL =
  'https://caltech-ipac.github.io/irsa-tutorials/spherex-hipscube/';
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
  if (!response.ok)
    throw new Error(
      `IRSA search failed (${response.status}). Retry; archive search requires the Parallax server.`
    );
  return parseArchiveTable(await response.text());
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
