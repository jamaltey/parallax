import { readHdus } from './fits.js';
import { celestialWcs, undistortedHeader } from './wcs.js';

const BLOCK = 2880;
const block = value => Math.ceil(value / BLOCK) * BLOCK;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function imageSource(buffer) {
  const hdu = readHdus(buffer)[0];
  const header = hdu?.header;
  if (!header || header.BITPIX !== -32 || header.NAXIS !== 2)
    throw new Error('Comparison requires a two-dimensional float32 FITS image.');
  const width = Number(header.NAXIS1);
  const height = Number(header.NAXIS2);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Comparison image dimensions are invalid.');
  return {
    buffer,
    hdu,
    header,
    width,
    height,
    view: new DataView(buffer),
    wcs: celestialWcs(header),
  };
}

function valueAt(source, x, y) {
  return source.view.getFloat32(source.hdu.dataOffset + (y * source.width + x) * 4, false);
}

export function bilinearSample(source, x, y) {
  if (
    ![x, y].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    x > source.width - 1 ||
    y > source.height - 1
  )
    return NaN;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, source.width - 1);
  const y1 = Math.min(y0 + 1, source.height - 1);
  const dx = x - x0;
  const dy = y - y0;
  const samples = [
    [x0, y0, (1 - dx) * (1 - dy)],
    [x1, y0, dx * (1 - dy)],
    [x0, y1, (1 - dx) * dy],
    [x1, y1, dx * dy],
  ];
  let result = 0;
  for (const [sampleX, sampleY, weight] of samples) {
    if (!weight) continue;
    const value = valueAt(source, sampleX, sampleY);
    if (!Number.isFinite(value)) return NaN;
    result += value * weight;
  }
  return result;
}

function quantile(values, fraction) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

function robustLocationScale(values) {
  const median = quantile(values, 0.5);
  const deviations = values.map(value => Math.abs(value - median));
  const mad = quantile(deviations, 0.5);
  const floor = Math.max(Math.abs(median) * 1e-6, 1e-12);
  const scale = Math.max(mad * 1.4826, floor);
  return { median, scale, constant: !(mad > floor * 1e-6) };
}

function card(key, value) {
  let encoded;
  if (typeof value === 'string') encoded = `'${value.replaceAll("'", "''")}'`;
  else if (typeof value === 'boolean') encoded = value ? 'T' : 'F';
  else encoded = String(value);
  return `${key.padEnd(8)}= ${encoded}`.padEnd(80, ' ').slice(0, 80);
}

function floatImageWriter(header, { unit = '', label = 'Parallax derived image' } = {}) {
  const cd = celestialWcs(header).cd;
  const cards = [
    card('SIMPLE', true),
    card('BITPIX', -32),
    card('NAXIS', 2),
    card('NAXIS1', header.NAXIS1),
    card('NAXIS2', header.NAXIS2),
    card('CTYPE1', String(header.CTYPE1).replace('-SIP', '')),
    card('CTYPE2', String(header.CTYPE2).replace('-SIP', '')),
    card('CRVAL1', header.CRVAL1),
    card('CRVAL2', header.CRVAL2),
    card('CRPIX1', header.CRPIX1),
    card('CRPIX2', header.CRPIX2),
    card('CD1_1', cd[0]),
    card('CD1_2', cd[1]),
    card('CD2_1', cd[2]),
    card('CD2_2', cd[3]),
    card('OBJECT', label),
  ];
  if (unit) cards.push(card('BUNIT', unit));
  cards.push('END'.padEnd(80, ' '));
  const headerText = cards.join('');
  const dataOffset = block(headerText.length);
  const pixelCount = header.NAXIS1 * header.NAXIS2;
  const output = new ArrayBuffer(dataOffset + block(pixelCount * 4));
  const bytes = new Uint8Array(output);
  bytes.fill(32, 0, dataOffset);
  bytes.set(new TextEncoder().encode(headerText));
  const view = new DataView(output);
  return {
    buffer: output,
    get(index) {
      return view.getFloat32(dataOffset + index * 4, false);
    },
    set(index, value) {
      view.setFloat32(dataOffset + index * 4, value, false);
    },
  };
}

export function floatImageFits(header, pixels, options) {
  const writer = floatImageWriter(header, options);
  for (let index = 0; index < pixels.length; index++) writer.set(index, pixels[index]);
  return writer.buffer;
}

export function compareFitsBuffers(aBuffer, bBuffer) {
  const startedAt = performance.now();
  const sourceA = imageSource(aBuffer);
  const sourceB = imageSource(bBuffer);
  const targetHeader = undistortedHeader(sourceA.header);
  const targetWcs = celestialWcs(targetHeader);
  const total = sourceA.width * sourceA.height;
  const unitA = String(sourceA.header.BUNIT || '').trim();
  const unitB = String(sourceB.header.BUNIT || '').trim();
  const rawCompatible = Boolean(unitA && unitB && unitA === unitB);
  const alignedA = floatImageWriter(targetHeader, {
    unit: unitA,
    label: 'Parallax aligned reference A',
  });
  const alignedB = floatImageWriter(targetHeader, {
    unit: unitB,
    label: 'Parallax aligned comparison B',
  });
  const sampleStep = Math.max(1, Math.floor(total / 65536));
  const samplesA = [];
  const samplesB = [];
  let validCount = 0;

  for (let y = 0; y < sourceA.height; y++) {
    for (let x = 0; x < sourceA.width; x++) {
      const index = y * sourceA.width + x;
      const [ra, dec] = targetWcs.pixelToWorld(x, y);
      const pixelA = sourceA.wcs.worldToPixel(ra, dec);
      const pixelB = sourceB.wcs.worldToPixel(ra, dec);
      if (!pixelA || !pixelB) {
        alignedA.set(index, NaN);
        alignedB.set(index, NaN);
        continue;
      }
      const valueA = bilinearSample(sourceA, pixelA[0], pixelA[1]);
      const valueB = bilinearSample(sourceB, pixelB[0], pixelB[1]);
      if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
        alignedA.set(index, NaN);
        alignedB.set(index, NaN);
        continue;
      }
      alignedA.set(index, valueA);
      alignedB.set(index, valueB);
      validCount++;
      if (index % sampleStep === 0) {
        samplesA.push(valueA);
        samplesB.push(valueB);
      }
    }
  }

  const minimumOverlap = Math.max(4, Math.floor(total * 0.0001));
  if (validCount < minimumOverlap)
    throw new Error('These observations do not have meaningful overlapping valid coverage.');
  if (!samplesA.length) {
    for (let index = 0; index < total; index++)
      if (Number.isFinite(alignedA.get(index))) {
        samplesA.push(alignedA.get(index));
        samplesB.push(alignedB.get(index));
      }
  }

  const normalizedA = robustLocationScale(samplesA);
  const normalizedB = robustLocationScale(samplesB);
  const rawDifference = rawCompatible
    ? floatImageWriter(targetHeader, {
        unit: unitA,
        label: 'Parallax raw difference B minus A',
      })
    : null;
  const normalizedDifference = floatImageWriter(targetHeader, {
    unit: 'dimensionless',
    label: 'Parallax normalized visual difference B minus A',
  });
  const absoluteRaw = [];
  const absoluteNormalized = [];
  const sharedValues = [];
  for (let index = 0; index < total; index++) {
    const valueA = alignedA.get(index);
    const valueB = alignedB.get(index);
    if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
      rawDifference?.set(index, NaN);
      normalizedDifference.set(index, NaN);
      continue;
    }
    const raw = valueB - valueA;
    const normalized =
      (valueB - normalizedB.median) / normalizedB.scale -
      (valueA - normalizedA.median) / normalizedA.scale;
    rawDifference?.set(index, raw);
    normalizedDifference.set(index, normalized);
    if (index % sampleStep === 0) {
      absoluteRaw.push(Math.abs(raw));
      absoluteNormalized.push(Math.abs(normalized));
      sharedValues.push(valueA, valueB);
    }
  }
  const commonMin = quantile(sharedValues, 0.01);
  const commonMax = Math.max(commonMin + 1e-12, quantile(sharedValues, 0.995));
  const rawLimit = Math.max(quantile(absoluteRaw, 0.99), 1e-12);
  const normalizedLimit = Math.max(quantile(absoluteNormalized, 0.99), 1e-6);
  const overlapFraction = validCount / total;

  const result = {
    aFits: alignedA.buffer,
    bFits: alignedB.buffer,
    rawFits: rawDifference?.buffer || null,
    normalizedFits: normalizedDifference.buffer,
    stats: {
      width: sourceA.width,
      height: sourceA.height,
      validCount,
      overlapFraction,
      unitA,
      unitB,
      rawCompatible,
      commonCuts: { minCut: commonMin, maxCut: commonMax },
      rawLimit,
      normalizedLimit,
      normalization: { a: normalizedA, b: normalizedB },
      elapsedMs: performance.now() - startedAt,
      targetCenter: [finiteNumber(targetHeader.CRVAL1), finiteNumber(targetHeader.CRVAL2)],
    },
  };
  return result;
}
