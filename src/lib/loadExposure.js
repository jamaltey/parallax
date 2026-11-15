import { validateExposure, IMAGE_VERSION } from '../citizen/model.js';
import { scienceImage } from './fits.js';
import { exposureCache, exposureCacheKey } from './exposureCache.js';

async function sha256(buffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), value =>
    value.toString(16).padStart(2, '0')
  ).join('');
}

export async function loadSpherexExposure(exposure, { signal } = {}) {
  validateExposure(exposure);
  if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
  const key = exposureCacheKey(exposure);
  const cached = exposureCache.get(key);
  if (cached) {
    if (exposure.imageHash && exposure.imageHash !== cached.imageHash)
      throw new Error(
        'The source image differs from the reporter’s saved checksum. Investigation is blocked.'
      );
    return materialize(exposure, cached);
  }
  const params = new URLSearchParams({ url: exposure.url });
  const response = await fetch(`/api/spherex-image?${params}`, { signal });
  if (!response.ok) {
    let message = 'Original exposure unavailable. Retry.';
    try {
      message = (await response.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  const buffer = await response.arrayBuffer();
  const image = scienceImage(buffer);
  if (
    image.header.OBSID !== exposure.obsId ||
    Number(image.header.DETECTOR) !== Number(exposure.band.slice(-1))
  )
    throw new Error('FITS observation identity does not match the selected archive record.');
  const imageHash = await sha256(buffer);
  if (exposure.imageHash && imageHash !== exposure.imageHash)
    throw new Error(
      'The source image differs from the reporter’s saved checksum. Investigation is blocked.'
    );
  const observedAt = new Date(
    image.header['DATE-OBS'] + (/Z$/.test(image.header['DATE-OBS']) ? '' : 'Z')
  ).toISOString();
  const display = exposure.display || {
    ...image.cuts,
    colormap: 'magma',
    stretch: 'asinh',
    extension: 'IMAGE',
  };
  const entry = {
    buffer,
    image,
    imageHash,
    observedAt,
    fitsMetadata: {
      obsId: image.header.OBSID,
      detector: image.header.DETECTOR,
      dateObs: image.header['DATE-OBS'],
      mjdStart: image.header['MJD-BEG'],
      mjdEnd: image.header['MJD-END'],
      bunit: image.header.BUNIT,
      width: image.header.NAXIS1,
      height: image.header.NAXIS2,
    },
  };
  exposureCache.set(key, entry);
  return materialize(exposure, entry, display);
}

function materialize(exposure, entry, fallbackDisplay) {
  const display = exposure.display ||
    fallbackDisplay || {
      ...entry.image.cuts,
      colormap: 'magma',
      stretch: 'asinh',
      extension: 'IMAGE',
    };
  return {
    buffer: entry.buffer,
    image: entry.image,
    metadata: {
      ...exposure,
      observedAt: entry.observedAt,
      imageHash: entry.imageHash,
      imageVersion: IMAGE_VERSION,
      fitsMetadata: entry.fitsMetadata,
      display,
    },
  };
}

export function getCachedExposureDisplay(exposure) {
  return exposureCache.get(exposureCacheKey(exposure))?.displayBuffer || null;
}

export function cacheExposureDisplay(exposure, displayBuffer) {
  exposureCache.update(exposureCacheKey(exposure), { displayBuffer });
}
