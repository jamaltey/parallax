import { exposureUrl } from './archive.js';
import { extractScienceImage } from './fits.js';
import { corsHeaders, jsonError, preflight, requestController } from './http.js';

export const IMAGE_TIMEOUT_MS = 60_000;
export const PREFIX_BYTES = 18 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 100 * 1024 * 1024;

async function readPrefix(response) {
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_SOURCE_BYTES)
    throw new Error('Exposure exceeds the 100 MB source limit.');
  if (!response.body) throw new Error('Original exposure returned no response body.');

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < PREFIX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > MAX_SOURCE_BYTES)
        throw new Error('Exposure exceeds the 100 MB source limit.');
      const remaining = PREFIX_BYTES - size;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(chunk);
      size += chunk.byteLength;
      if (size >= PREFIX_BYTES) {
        await reader.cancel('SPHEREx IMAGE prefix obtained');
        break;
      }
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export async function handleSpherexImage(
  request,
  { fetchImpl = fetch, timeoutMs = IMAGE_TIMEOUT_MS } = {}
) {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== 'GET')
    return jsonError(405, 'Use GET for SPHEREx images.', { Allow: 'GET, OPTIONS' });

  let source;
  try {
    source = exposureUrl(new URL(request.url).searchParams.get('url'));
  } catch {
    return jsonError(400, 'Invalid SPHEREx file URL.');
  }

  const lifecycle = requestController(request, timeoutMs);
  try {
    const response = await fetchImpl(source, {
      signal: lifecycle.controller.signal,
      redirect: 'error',
      headers: { Accept: 'application/fits' },
    });
    if (!response.ok)
      throw new Error(`Original exposure is unavailable (IRSA ${response.status}).`);
    const image = extractScienceImage(await readPrefix(response));
    return new Response(image, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/fits',
        'Content-Length': String(image.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return jsonError(
      502,
      lifecycle.didTimeOut() ? 'Exposure request timed out. Retry.' : error.message
    );
  } finally {
    lifecycle.dispose();
  }
}
