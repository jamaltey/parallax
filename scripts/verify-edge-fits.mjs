import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { extractScienceImage, readHdus } from '../src/lib/fits.js';
import { exposureRoute } from '../server/exposure.js';
import { handleSpherexImage } from '../supabase/functions/_shared/spherexImage.js';

const path = process.argv[2];
if (!path) {
  console.error('Usage: npm run verify:edge-fits -- /path/to/original-spherex.fits [original-url]');
  process.exitCode = 2;
} else {
  const sourceUrl =
    process.argv[3] ||
    'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W18_1B/l2b-v27-2026-196/1/level2_2025W18_1B_0074_2D1_spx_l2b-v27-2026-196.fits';
  const source = await readFile(path);
  const sourceBuffer = source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength
  );
  const started = performance.now();
  const expected = extractScienceImage(sourceBuffer);
  const directMs = performance.now() - started;

  const edgeStarted = performance.now();
  const edgeResponse = await handleSpherexImage(
    new Request(
      `https://project.supabase.co/functions/v1/spherex-image?${new URLSearchParams({ url: sourceUrl })}`
    ),
    { fetchImpl: async () => new Response(source) }
  );
  if (!edgeResponse.ok) throw new Error(await edgeResponse.text());
  const edge = new Uint8Array(await edgeResponse.arrayBuffer());
  const edgeMs = performance.now() - edgeStarted;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(source);
  const nodeResponse = {
    status: 0,
    headers: {},
    destroyed: false,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    writeHead(status, headers = {}) {
      this.status = status;
      Object.assign(this.headers, headers);
    },
    end(body) {
      this.body = body;
    },
    on() {},
  };
  const nodeStarted = performance.now();
  try {
    await exposureRoute(
      {
        method: 'GET',
        url: `/api/spherex-image?${new URLSearchParams({ url: sourceUrl })}`,
        on() {},
      },
      nodeResponse
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  const nodeMs = performance.now() - nodeStarted;
  if (nodeResponse.status !== 200) throw new Error(String(nodeResponse.body));
  const node = new Uint8Array(nodeResponse.body);

  const hash = value => createHash('sha256').update(value).digest('hex');
  const expectedHash = hash(expected);
  const image = readHdus(edge.buffer)[0];
  const result = {
    sourceBytes: source.byteLength,
    extractedBytes: expected.byteLength,
    sha256: expectedHash,
    edgeMatchesShared: hash(edge) === expectedHash,
    nodeMatchesShared: hash(node) === expectedHash,
    metadata: {
      obsId: image.header.OBSID,
      detector: image.header.DETECTOR,
      dateObs: image.header['DATE-OBS'],
      ctype1: image.header.CTYPE1,
      ctype2: image.header.CTYPE2,
      width: image.header.NAXIS1,
      height: image.header.NAXIS2,
    },
    localTimingMs: {
      sharedExtraction: Number(directMs.toFixed(1)),
      edgeHandler: Number(edgeMs.toFixed(1)),
      nodeHandler: Number(nodeMs.toFixed(1)),
    },
    processRssMiB: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.edgeMatchesShared || !result.nodeMatchesShared) process.exitCode = 1;
}
