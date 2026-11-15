const MIRRORS = [
  {
    name: 'CfA Harvard SIMBAD mirror',
    tap: 'https://simbad.cfa.harvard.edu/simbad/sim-tap/sync',
    object: 'https://simbad.cfa.harvard.edu/simbad/sim-id',
  },
  {
    name: 'IDIA SIMBAD mirror',
    tap: 'https://simbad.idia.ac.za/simbad/sim-tap/sync',
    object: 'https://simbad.idia.ac.za/simbad/sim-id',
  },
];

function finiteCoordinate(value, name, minimum, maximum, inclusiveMaximum = true) {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < minimum ||
    (inclusiveMaximum ? number > maximum : number >= maximum)
  )
    throw new Error(`Invalid ${name}.`);
  return number;
}

export function objectLookupRequest(url) {
  for (const key of ['ra', 'dec', 'radius'])
    if (!url.searchParams.has(key) || !url.searchParams.get(key).trim())
      throw new Error(`Missing ${key}.`);
  const ra = finiteCoordinate(url.searchParams.get('ra'), 'ra', 0, 360, false);
  const dec = finiteCoordinate(url.searchParams.get('dec'), 'dec', -90, 90);
  const radius = finiteCoordinate(url.searchParams.get('radius'), 'radius', 0, 0.1);
  if (radius === 0) throw new Error('Invalid radius.');
  return { ra, dec, radius };
}

export function simbadQuery({ ra, dec, radius }) {
  return `SELECT TOP 1 main_id, ra, dec, otype, sp_type, DISTANCE(POINT('ICRS', ra, dec), POINT('ICRS', ${ra}, ${dec})) AS separation FROM basic WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra}, ${dec}, ${radius})) ORDER BY separation ASC`;
}

function tapUrl(mirror, coordinates) {
  const url = new URL(mirror.tap);
  url.searchParams.set('request', 'doQuery');
  url.searchParams.set('lang', 'adql');
  url.searchParams.set('format', 'tsv');
  url.searchParams.set('query', simbadQuery(coordinates));
  return url;
}

function unquote(value) {
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1).replaceAll('""', '"');
  return value;
}

export function parseSimbadTsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2 || !lines[1].trim()) return null;
  const headings = lines[0].split('\t');
  const values = lines[1].split('\t').map(unquote);
  const row = Object.fromEntries(headings.map((heading, index) => [heading, values[index] || '']));
  const ra = Number(row.ra);
  const dec = Number(row.dec);
  const separation = Number(row.separation);
  if (!row.main_id || !Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(separation))
    throw new Error('SIMBAD returned an invalid table.');
  return {
    name: row.main_id,
    ra,
    dec,
    objectType: row.otype || 'Unknown',
    spectralType: row.sp_type || '',
    separationArcsec: separation * 3600,
  };
}

export async function objectLookupRoute(req, res, next = () => {}) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/object-lookup') return next();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET' });
    return res.end(JSON.stringify({ error: 'Use GET for object lookup.' }));
  }
  let coordinates;
  try {
    coordinates = objectLookupRequest(url);
  } catch (error) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: error.message }));
  }

  for (const mirror of MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    res.on('close', () => controller.abort());
    try {
      const response = await fetch(tapUrl(mirror, coordinates), {
        signal: controller.signal,
        redirect: 'error',
        headers: { Accept: 'text/tab-separated-values' },
      });
      if (!response.ok) throw new Error(`Mirror returned HTTP ${response.status}.`);
      const result = parseSimbadTsv(await response.text());
      clearTimeout(timer);
      if (!result) {
        res.writeHead(404);
        return res.end(
          JSON.stringify({
            error:
              'No SIMBAD catalog object was found near this position. The image may still contain a real uncataloged or unresolved source.',
            noMatch: true,
            provider: mirror.name,
          })
        );
      }
      const objectUrl = new URL(mirror.object);
      objectUrl.searchParams.set('Ident', result.name);
      res.writeHead(200);
      return res.end(
        JSON.stringify({ ...result, provider: mirror.name, objectUrl: objectUrl.toString() })
      );
    } catch {
      clearTimeout(timer);
    }
  }

  res.writeHead(502);
  return res.end(
    JSON.stringify({
      error: 'The official Harvard and IDIA SIMBAD mirrors are unavailable. Please retry.',
    })
  );
}
