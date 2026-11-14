// Runtime-independent FITS IMAGE reader shared by browsers, Node.js, and Edge Functions.
// No reprojection, subtraction, resampling, or flux calibration is performed.
const decoder = new TextDecoder('ascii');
const block = n => Math.ceil(n / 2880) * 2880;
export function readHdus(buffer, stopAtImage = false) {
  const bytes = new Uint8Array(buffer);
  const hdus = [];
  let offset = 0;
  while (offset + 80 <= bytes.length) {
    const header = {};
    const cards = [];
    let cursor = offset;
    let ended = false;
    for (; cursor + 80 <= bytes.length; cursor += 80) {
      const card = decoder.decode(bytes.subarray(cursor, cursor + 80));
      cards.push(card);
      const key = card.slice(0, 8).trim();
      if (key === 'END') {
        cursor += 80;
        ended = true;
        break;
      }
      if (card[8] !== '=') continue;
      const value = card.slice(10).trim();
      if (value.startsWith("'")) header[key] = value.slice(1, value.indexOf("'", 1)).trim();
      else {
        const token = value.split('/')[0].trim();
        header[key] =
          token === 'T' ? true : token === 'F' ? false : Number(token.replace('D', 'E'));
      }
    }
    if (!ended) throw new Error('Incomplete FITS header.');
    const dataOffset = offset + block(cursor - offset);
    const axes = Number(header.NAXIS);
    if (!Number.isInteger(axes) || axes < 0 || axes > 9)
      throw new Error('Unsupported FITS dimensions.');
    let count = axes ? 1 : 0;
    for (let axis = 1; axis <= axes; axis++) count *= header[`NAXIS${axis}`];
    const dataSize =
      (Math.abs(header.BITPIX) / 8) * (count + (header.PCOUNT || 0)) * (header.GCOUNT || 1);
    if (!Number.isSafeInteger(dataSize) || dataSize < 0 || dataOffset + dataSize > bytes.length)
      throw new Error('Incomplete FITS pixels.');
    hdus.push({ header, cards, dataOffset, dataSize });
    if (stopAtImage && header.EXTNAME === 'IMAGE') break;
    offset = dataOffset + block(dataSize);
  }
  return hdus;
}
export function extractScienceImage(buffer) {
  const hdu = readHdus(buffer, true).find(h => h.header.EXTNAME === 'IMAGE');
  if (!hdu || hdu.header.NAXIS !== 2 || hdu.header.BITPIX !== -32)
    throw new Error('Expected SPHEREx float32 IMAGE extension.');
  const cards = [
    'SIMPLE  =                    T',
    ...hdu.cards.filter(
      c =>
        !['XTENSION', 'PCOUNT', 'GCOUNT', 'CHECKSUM', 'DATASUM', 'END'].includes(
          c.slice(0, 8).trim()
        )
    ),
    'END',
  ];
  const header = cards.map(c => c.padEnd(80, ' ')).join('');
  const headerSize = block(header.length);
  const output = new Uint8Array(headerSize + block(hdu.dataSize));
  output.fill(32, 0, headerSize);
  output.set(new TextEncoder().encode(header));
  output.set(new Uint8Array(buffer, hdu.dataOffset, hdu.dataSize), headerSize);
  return output;
}

export function scienceImage(buffer) {
  const hdu = readHdus(buffer)[0];
  const h = hdu?.header;
  if (
    !h ||
    h.NAXIS !== 2 ||
    h.BITPIX !== -32 ||
    !String(h.CTYPE1).startsWith('RA---TAN') ||
    !String(h.CTYPE2).startsWith('DEC--TAN')
  )
    throw new Error('This image does not have a supported celestial TAN WCS.');
  const cd = [
    h.CD1_1 ?? (h.PC1_1 ?? 1) * h.CDELT1,
    h.CD1_2 ?? (h.PC1_2 ?? 0) * h.CDELT1,
    h.CD2_1 ?? (h.PC2_1 ?? 0) * h.CDELT2,
    h.CD2_2 ?? (h.PC2_2 ?? 1) * h.CDELT2,
  ];
  if (![h.CRVAL1, h.CRVAL2, h.CRPIX1, h.CRPIX2, ...cd].every(Number.isFinite))
    throw new Error('Incomplete image WCS.');
  const det = cd[0] * cd[3] - cd[1] * cd[2];
  if (!det) throw new Error('Invalid image WCS.');
  const rad = Math.PI / 180;
  function polynomial(prefix, x, y) {
    let result = 0;
    const order = h[`${prefix}_ORDER`] || 0;
    if (order > 9) throw new Error('Unsupported SIP order.');
    for (let i = 0; i <= order; i++)
      for (let j = 0; j <= order - i; j++)
        result += (h[`${prefix}_${i}_${j}`] || 0) * x ** i * y ** j;
    return result;
  }
  function pixelAt(ra, dec) {
    const da = (ra - h.CRVAL1) * rad;
    const d = dec * rad;
    const d0 = h.CRVAL2 * rad;
    const denominator = Math.sin(d) * Math.sin(d0) + Math.cos(d) * Math.cos(d0) * Math.cos(da);
    if (denominator <= 0) return null;
    const xi = (Math.cos(d) * Math.sin(da)) / denominator / rad;
    const eta =
      (Math.sin(d) * Math.cos(d0) - Math.cos(d) * Math.sin(d0) * Math.cos(da)) / denominator / rad;
    const u = (cd[3] * xi - cd[1] * eta) / det;
    const v = (-cd[2] * xi + cd[0] * eta) / det;
    let x = u,
      y = v;
    for (let n = 0; n < 30; n++) {
      const nx = u - polynomial('A', x, y),
        ny = v - polynomial('B', x, y);
      if (Math.abs(nx - x) + Math.abs(ny - y) < 1e-6) {
        x = nx;
        y = ny;
        break;
      }
      x = nx;
      y = ny;
    }
    if (Math.abs(x + polynomial('A', x, y) - u) + Math.abs(y + polynomial('B', x, y) - v) > 0.01)
      return null;
    return [x + h.CRPIX1 - 1, y + h.CRPIX2 - 1];
  }
  const samples = [];
  const pixels = new DataView(buffer);
  const step = Math.max(1, Math.floor((h.NAXIS1 * h.NAXIS2) / 65536));
  for (let i = 0; i < h.NAXIS1 * h.NAXIS2; i += step) {
    const value = pixels.getFloat32(hdu.dataOffset + i * 4, false);
    if (Number.isFinite(value)) samples.push(value);
  }
  samples.sort((a, b) => a - b);
  if (!samples.length) throw new Error('This exposure has no finite science pixels.');
  const minCut = samples[Math.floor(samples.length * 0.01)];
  const maxCut = Math.max(minCut + 1e-6, samples[Math.floor(samples.length * 0.995)]);
  return {
    header: h,
    pixelAt,
    cuts: { minCut, maxCut },
    contains(ra, dec) {
      const p = pixelAt(ra, dec);
      if (!p || !p.every(Number.isFinite)) return false;
      const [x, y] = p.map(Math.round);
      if (x < 0 || y < 0 || x >= h.NAXIS1 || y >= h.NAXIS2) return false;
      return Number.isFinite(
        new DataView(buffer).getFloat32(hdu.dataOffset + (y * h.NAXIS1 + x) * 4, false)
      );
    },
  };
}
