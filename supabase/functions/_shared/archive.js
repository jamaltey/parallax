import { validatePosition } from './coordinates.js';

export const SPHEREX_COLLECTIONS = ['spherex_dr1', 'spherex_qr3'];
export const IRSA_ORIGIN = 'https://irsa.ipac.caltech.edu';

export function archiveSearchUrl(position, collection = 'spherex_dr1') {
  validatePosition(position);
  if (!SPHEREX_COLLECTIONS.includes(collection)) throw new Error('Unsupported SPHEREx collection.');
  const url = new URL(`${IRSA_ORIGIN}/SIA`);
  url.search = new URLSearchParams({
    COLLECTION: collection,
    POS: `CIRCLE ${position.ra} ${position.dec} ${1 / 3600}`,
    RESPONSEFORMAT: 'TSV',
    MAXREC: '50',
  }).toString();
  return url.href;
}

export function exposureUrl(value) {
  const url = new URL(value);
  if (
    url.origin !== IRSA_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/ibe\/data\/spherex\/(dr1|qr3)\/level2\/[A-Za-z0-9_/-]+\.fits$/.test(url.pathname) ||
    value.includes('..')
  )
    throw new Error('Only original SPHEREx exposure files are accepted.');
  return url.href;
}
