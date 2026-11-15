import { validatePosition } from './coordinates.js';

export const DEFAULT_POSITION = Object.freeze({ ra: 83.633, dec: 22.0145, fov: 2 });

export function parseExplorerUrl(search = '') {
  const params = new URLSearchParams(search);
  const embed = params.get('embed') === '1';
  const hasCoordinates = ['ra', 'dec', 'fov'].some(name => params.has(name));
  if (!hasCoordinates)
    return { position: { ...DEFAULT_POSITION }, embed, hasCoordinates: false, error: '' };
  if (!params.has('ra') || !params.has('dec'))
    return {
      position: { ...DEFAULT_POSITION },
      embed,
      hasCoordinates: true,
      error: 'A coordinate link must include both ra and dec. Using the starting position instead.',
    };
  const raw = name => {
    const value = params.get(name);
    return value == null || value.trim() === '' ? NaN : Number(value);
  };
  try {
    return {
      position: validatePosition({
        ra: raw('ra'),
        dec: raw('dec'),
        fov: params.has('fov') ? raw('fov') : DEFAULT_POSITION.fov,
      }),
      embed,
      hasCoordinates: true,
      error: '',
    };
  } catch (error) {
    return {
      position: { ...DEFAULT_POSITION },
      embed,
      hasCoordinates: true,
      error: `${error.message} Using the starting position instead.`,
    };
  }
}

export function explorerUrl(
  position,
  { embed = false, origin = 'https://parallax.dcephei.earth' } = {}
) {
  const valid = validatePosition(position);
  const url = new URL('/', origin);
  url.searchParams.set('ra', String(valid.ra));
  url.searchParams.set('dec', String(valid.dec));
  url.searchParams.set('fov', String(valid.fov));
  if (embed) url.searchParams.set('embed', '1');
  else url.hash = 'explorer';
  return url.toString();
}
