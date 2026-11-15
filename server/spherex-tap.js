const BAND_LIMITS = {
  'SPHEREx-D1': [0.744e-6, 1.116e-6],
  'SPHEREx-D2': [1.099e-6, 1.651e-6],
  'SPHEREx-D3': [1.636e-6, 2.421e-6],
  'SPHEREx-D4': [2.423e-6, 3.822e-6],
  'SPHEREx-D5': [3.809e-6, 4.42e-6],
  'SPHEREx-D6': [4.412e-6, 5.002e-6],
};

function parseRows(text) {
  const lines = text.trim().split(/\r?\n/);
  const fields = (lines.shift() || '').split('\t');
  const required = ['access_url', 'time_bounds_lower', 'time_bounds_upper', 'energy_bandpassname'];
  if (!required.every(field => fields.includes(field)))
    throw new Error('IRSA TAP returned an unexpected archive table.');
  return lines.filter(Boolean).map(line => {
    const values = line.split('\t');
    return Object.fromEntries(fields.map((field, index) => [field, values[index] || '']));
  });
}

function exposureIdentity(url) {
  const match = url.pathname.match(/\/level2_([^/]+?)D([1-6])_spx_[^/]+\.fits$/);
  if (!match) throw new Error('IRSA TAP returned an unsupported SPHEREx product URL.');
  return { obsId: match[1], detector: match[2] };
}

export function normalizeTapArchiveTable(text, collection) {
  const rows = parseRows(text).map(row => {
    const url = new URL(row.access_url);
    const release = collection === 'spherex_dr1' ? 'dr1' : 'qr3';
    if (
      url.origin !== 'https://irsa.ipac.caltech.edu' ||
      !url.pathname.startsWith(`/ibe/data/spherex/${release}/level2/`) ||
      url.search ||
      url.hash
    )
      throw new Error('IRSA TAP returned an unexpected archive file URL.');
    const identity = exposureIdentity(url);
    const band = row.energy_bandpassname || `SPHEREx-D${identity.detector}`;
    const bounds = BAND_LIMITS[band];
    if (!bounds) throw new Error('IRSA TAP returned an unsupported detector band.');
    return {
      access_url: url.href,
      obs_id: identity.obsId,
      t_min: row.time_bounds_lower,
      t_max: row.time_bounds_upper,
      energy_bandpassname: band,
      em_min: bounds[0],
      em_max: bounds[1],
      obs_collection: collection,
      obs_publisher_did: `ivo://irsa.ipac/${collection}?${identity.obsId}/D${identity.detector}`,
      access_format: 'image/fits',
      provenance_version: row.provenance_version,
    };
  });
  const fields = [
    'access_url',
    'obs_id',
    't_min',
    't_max',
    'energy_bandpassname',
    'em_min',
    'em_max',
    'obs_collection',
    'obs_publisher_did',
    'access_format',
    'provenance_version',
  ];
  return [
    fields.join('\t'),
    ...rows.map(row => fields.map(field => row[field] ?? '').join('\t')),
  ].join('\n');
}
