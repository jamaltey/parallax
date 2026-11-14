import { validatePosition } from '../lib/coordinates.js';

// Demo band groups, NOT verified SPHEREx channel IDs or calibrated wavelengths.
export const BANDS = [
  { id: 'demo-short', label: 'Short infrared · demo group' },
  { id: 'demo-mid', label: 'Mid infrared · demo group' },
  { id: 'demo-long', label: 'Long infrared · demo group' },
];

export function validateResponse(data) {
  if (!data || !Array.isArray(data.observations))
    throw new Error('API must return { observations: [] }.');
  const ids = new Set();
  for (const row of data.observations) {
    if (
      !row ||
      typeof row.id !== 'string' ||
      !row.id ||
      ids.has(row.id) ||
      !Number.isFinite(Date.parse(row.observedAt)) ||
      typeof row.band !== 'string' ||
      typeof row.isMock !== 'boolean' ||
      typeof row.provenance !== 'string'
    ) {
      throw new Error('Invalid observation metadata or duplicate ID.');
    }
    ids.add(row.id);
  }
  return [...data.observations].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
}

export async function getObservations(
  query,
  {
    signal,
    mode = import.meta.env?.VITE_OBSERVATION_MODE || 'mock',
    baseUrl = import.meta.env?.VITE_OBSERVATION_API_URL,
  } = {}
) {
  validatePosition(query);
  if (!BANDS.some(b => b.id === query.band)) throw new Error('Unknown demo band.');
  signal?.throwIfAborted();
  if (mode === 'mock') {
    // Synthetic dates are illustrative; they are not mission coverage claims.
    return validateResponse({
      observations: Array.from({ length: 8 }, (_, i) => ({
        id: `${query.band}-${i}`,
        observedAt: new Date(Date.UTC(2025, 4 + i, 15)).toISOString(),
        band: query.band,
        isMock: true,
        provenance: 'Synthetic Parallax demonstration metadata',
      })),
    });
  }
  if (mode !== 'http') throw new Error('Observation mode must be mock or http.');
  if (!baseUrl) throw new Error('Set VITE_OBSERVATION_API_URL to your observation adapter URL.');

  const url = new URL(baseUrl, window.location.origin);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));

  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Observation request failed (${response.status}).`);

  const rows = validateResponse(await response.json());
  if (rows.some(row => row.band !== query.band))
    throw new Error('Adapter returned observations for a different band.');

  return rows;
}
