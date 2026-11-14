import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../public/samples/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('provenance.json', root), 'utf8'));
for (const sample of manifest) {
  test(`bundled FITS sample is intact and has celestial WCS: ${sample.file}`, () => {
    const bytes = readFileSync(new URL(sample.file, root));
    assert.equal(bytes.length, sample.bytes);
    assert.equal(bytes.length % 2880, 0);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sample.sha256);
    assert.equal(bytes.subarray(0, 9).toString(), 'SIMPLE  =');
    const cards = [];
    for (let offset = 0; offset < bytes.length; offset += 80) {
      const card = bytes.subarray(offset, offset + 80).toString('ascii');
      if (card.startsWith('END ')) break;
      cards.push(card);
    }
    const header = cards.join('\n');
    assert.match(header, /CTYPE1\s*= 'RA---TAN/);
    assert.match(header, /CTYPE2\s*= 'DEC--TAN/);
    assert.match(header, /CRVAL1\s*=/);
    assert.match(header, /CRVAL2\s*=/);
  });
}
