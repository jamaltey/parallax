import { validatePosition } from '../lib/coordinates.js';
export const CHANGE_TYPES = {
  moving: 'Moving object',
  brightness: 'Brightness variation',
  transient: 'Appeared / disappeared',
  artifact: 'Possible image artifact',
};
export const CONFIDENCES = ['low', 'medium', 'high'];
export const IMAGE_VERSION = 'spherex-image-hdu-v1';
export function validateExposure(frame) {
  if (
    !frame ||
    frame.isMock !== false ||
    frame.mission !== 'SPHEREx' ||
    frame.product !== 'spectral-exposure' ||
    !frame.obsId ||
    !frame.id ||
    !Number.isFinite(Date.parse(frame.observedAt)) ||
    !/^SPHEREx-D[1-6]$/.test(frame.band) ||
    !['spherex_dr1', 'spherex_qr3'].includes(frame.collection)
  )
    throw new Error('Select an original SPHEREx spectral exposure with complete metadata.');
  const url = new URL(frame.url);
  if (
    url.origin !== 'https://irsa.ipac.caltech.edu' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/ibe\/data\/spherex\/(dr1|qr3)\/level2\/[A-Za-z0-9_./-]+\.fits$/.test(url.pathname) ||
    url.pathname.includes('..')
  )
    throw new Error('Unsupported SPHEREx exposure URL.');
  if (
    !url.pathname.endsWith(
      `level2_${frame.obsId}D${frame.band.slice(-1)}_spx_${frame.processingVersion}.fits`
    )
  )
    throw new Error('Observation identity does not match the original file.');
  if (!(frame.wavelengthMin > 0 && frame.wavelengthMax > frame.wavelengthMin))
    throw new Error('Missing exposure wavelength bounds.');
  return frame;
}
export function validateCandidate(input) {
  validatePosition({ ra: input.center_ra, dec: input.center_dec, fov: input.fov });
  validatePosition({ ra: input.ra, dec: input.dec, fov: input.fov });
  if (!Object.hasOwn(CHANGE_TYPES, input.type) || !CONFIDENCES.includes(input.confidence))
    throw new Error('Choose a change type and confidence.');
  if (typeof input.description !== 'string' || input.description.length > 2000)
    throw new Error('Description must be at most 2,000 characters.');
  if (
    !Array.isArray(input.observations) ||
    !input.observations.length ||
    input.observations.length > 12
  )
    throw new Error('Mark between 1 and 12 exposures.');
  const ids = new Set();
  for (const mark of input.observations) {
    validateExposure(mark);
    validatePosition({ ra: mark.ra, dec: mark.dec, fov: mark.view?.fov });
    validatePosition(mark.view);
    if (ids.has(mark.id)) throw new Error('Only one marker per exposure is allowed.');
    ids.add(mark.id);
    if (!/^[a-f0-9]{64}$/.test(mark.imageHash) || mark.imageVersion !== IMAGE_VERSION)
      throw new Error('Load and mark each original exposure before submitting.');
  }
  if (
    input.type === 'moving' &&
    (new Set(input.observations.map(o => o.observedAt)).size < 2 ||
      new Set(input.observations.map(o => o.obsId)).size < 2)
  )
    throw new Error(
      'Motion candidates need two marked exposures from different observation times.'
    );
  return input;
}
export function agreementStats(rows) {
  const agree = rows.filter(r => r.verdict === 'agree').length;
  const disagree = rows.filter(r => r.verdict === 'disagree').length;
  const unsure = rows.filter(r => r.verdict === 'unsure').length;
  return {
    total: rows.length,
    agree,
    disagree,
    unsure,
    agreement: agree + disagree ? (100 * agree) / (agree + disagree) : null,
  };
}
