const RAD = Math.PI / 180;

const wrapDegrees = value => ((value % 360) + 360) % 360;
const longitudeDelta = (value, reference) => ((value - reference + 540) % 360) - 180;

function sipTerms(header, prefix) {
  const order = Number(header[`${prefix}_ORDER`] || 0);
  if (!Number.isInteger(order) || order < 0 || order > 9) throw new Error('Unsupported SIP order.');
  const terms = [];
  for (let i = 0; i <= order; i++)
    for (let j = 0; j <= order - i; j++) {
      const value = Number(header[`${prefix}_${i}_${j}`] || 0);
      if (value) terms.push([i, j, value]);
    }
  return terms;
}

function polynomial(terms, x, y) {
  let result = 0;
  for (const [i, j, value] of terms) result += value * x ** i * y ** j;
  return result;
}

export function celestialWcs(header) {
  if (
    !String(header.CTYPE1).startsWith('RA---TAN') ||
    !String(header.CTYPE2).startsWith('DEC--TAN')
  )
    throw new Error('This image does not have a supported celestial TAN WCS.');
  const cd = [
    header.CD1_1 ?? (header.PC1_1 ?? 1) * header.CDELT1,
    header.CD1_2 ?? (header.PC1_2 ?? 0) * header.CDELT1,
    header.CD2_1 ?? (header.PC2_1 ?? 0) * header.CDELT2,
    header.CD2_2 ?? (header.PC2_2 ?? 1) * header.CDELT2,
  ].map(Number);
  const required = [header.CRVAL1, header.CRVAL2, header.CRPIX1, header.CRPIX2, ...cd].map(Number);
  if (!required.every(Number.isFinite)) throw new Error('Incomplete image WCS.');
  const [ra0, dec0, crpix1, crpix2] = required;
  const determinant = cd[0] * cd[3] - cd[1] * cd[2];
  if (!determinant) throw new Error('Invalid image WCS.');
  const a = sipTerms(header, 'A');
  const b = sipTerms(header, 'B');
  const sinDec0 = Math.sin(dec0 * RAD);
  const cosDec0 = Math.cos(dec0 * RAD);

  function pixelToWorld(px, py) {
    const x = px + 1 - crpix1;
    const y = py + 1 - crpix2;
    const u = x + polynomial(a, x, y);
    const v = y + polynomial(b, x, y);
    const xi = (cd[0] * u + cd[1] * v) * RAD;
    const eta = (cd[2] * u + cd[3] * v) * RAD;
    const denominator = cosDec0 - eta * sinDec0;
    const ra = ra0 * RAD + Math.atan2(xi, denominator);
    const dec = Math.atan2(sinDec0 + eta * cosDec0, Math.hypot(denominator, xi));
    return [wrapDegrees(ra / RAD), dec / RAD];
  }

  function worldToPixel(ra, dec) {
    if (![ra, dec].every(Number.isFinite)) return null;
    const deltaRa = longitudeDelta(ra, ra0) * RAD;
    const decRad = dec * RAD;
    const denominator = Math.sin(decRad) * sinDec0 + Math.cos(decRad) * cosDec0 * Math.cos(deltaRa);
    if (!(denominator > 0)) return null;
    const xi = (Math.cos(decRad) * Math.sin(deltaRa)) / denominator / RAD;
    const eta =
      (Math.sin(decRad) * cosDec0 - Math.cos(decRad) * sinDec0 * Math.cos(deltaRa)) /
      denominator /
      RAD;
    const u = (cd[3] * xi - cd[1] * eta) / determinant;
    const v = (-cd[2] * xi + cd[0] * eta) / determinant;
    let x = u;
    let y = v;
    for (let iteration = 0; iteration < 30; iteration++) {
      const nextX = u - polynomial(a, x, y);
      const nextY = v - polynomial(b, x, y);
      const delta = Math.abs(nextX - x) + Math.abs(nextY - y);
      x = nextX;
      y = nextY;
      if (delta < 1e-6) break;
    }
    const residual = Math.abs(x + polynomial(a, x, y) - u) + Math.abs(y + polynomial(b, x, y) - v);
    if (residual > 0.01) return null;
    return [x + crpix1 - 1, y + crpix2 - 1];
  }

  return { cd, pixelToWorld, worldToPixel };
}

export function undistortedHeader(header) {
  const copy = { ...header };
  for (const key of Object.keys(copy)) if (/^[AB]P?_(?:ORDER|\d+_\d+)$/.test(key)) delete copy[key];
  copy.CTYPE1 = String(copy.CTYPE1).replace('-SIP', '');
  copy.CTYPE2 = String(copy.CTYPE2).replace('-SIP', '');
  return copy;
}
