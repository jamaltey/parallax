import { readHdus } from './fits.js';

// Display-only resampling from the original TAN-SIP pixel grid to TAN.
// Both grids retain the same reference point and linear WCS. Therefore the
// target pixel offset equals the source's SIP-corrected pixel offset; no sky
// projection approximation or external background coordinates are involved.
export function renderFitsImage(buffer) {
  const hdu = readHdus(buffer)[0];
  const h = hdu.header;
  if (!String(h.CTYPE1).endsWith('-SIP')) return buffer.slice(0);
  const width = h.NAXIS1,
    height = h.NAXIS2;
  const terms = prefix =>
    Object.entries(h)
      .filter(([key]) => new RegExp(`^${prefix}_\\d+_\\d+$`).test(key))
      .map(([key, value]) => [...key.split('_').slice(1).map(Number), value]);
  const a = terms('A'),
    b = terms('B');
  const polynomial = (terms, x, y) => {
    let sum = 0;
    for (const [i, j, value] of terms) sum += value * x ** i * y ** j;
    return sum;
  };
  const cards = hdu.cards
    .filter(card => !/^(?:[AB]P?_(?:ORDER|\d+_\d+)|END)$/.test(card.slice(0, 8).trim()))
    .map(card => (/^CTYPE[12] /.test(card) ? card.replace('-SIP', '    ') : card));
  cards.push('END'.padEnd(80));
  const header = cards.join('');
  const offset = Math.ceil(header.length / 2880) * 2880;
  const output = new ArrayBuffer(offset + Math.ceil((width * height * 4) / 2880) * 2880);
  new Uint8Array(output).fill(32, 0, offset);
  new Uint8Array(output).set(new TextEncoder().encode(header));
  const src = new DataView(buffer),
    dst = new DataView(output);
  const valueAt = (x, y) => src.getFloat32(hdu.dataOffset + (y * width + x) * 4, false);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const u = px + 1 - h.CRPIX1,
        v = py + 1 - h.CRPIX2;
      let x = u,
        y = v;
      for (let iteration = 0; iteration < 20; iteration++) {
        const nx = u - polynomial(a, x, y),
          ny = v - polynomial(b, x, y);
        const delta = Math.abs(nx - x) + Math.abs(ny - y);
        x = nx;
        y = ny;
        if (delta < 1e-6) break;
      }
      const residual =
        Math.abs(x + polynomial(a, x, y) - u) + Math.abs(y + polynomial(b, x, y) - v);
      x += h.CRPIX1 - 1;
      y += h.CRPIX2 - 1;
      let value = NaN;
      if (residual < 0.01 && x >= 0 && y >= 0 && x <= width - 1 && y <= height - 1) {
        const x0 = Math.floor(x),
          y0 = Math.floor(y);
        const x1 = Math.min(x0 + 1, width - 1),
          y1 = Math.min(y0 + 1, height - 1);
        const dx = x - x0,
          dy = y - y0;
        value =
          valueAt(x0, y0) * (1 - dx) * (1 - dy) +
          valueAt(x1, y0) * dx * (1 - dy) +
          valueAt(x0, y1) * (1 - dx) * dy +
          valueAt(x1, y1) * dx * dy;
      }
      dst.setFloat32(offset + (py * width + px) * 4, value, false);
    }
  }
  return output;
}
