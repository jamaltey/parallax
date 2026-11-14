import { archiveSearchUrl } from './archive.js';
import { corsHeaders, jsonError, preflight, requestController } from './http.js';

export const EXPOSURE_SEARCH_TIMEOUT_MS = 25_000;

export async function handleSpherexExposures(
  request,
  { fetchImpl = fetch, timeoutMs = EXPOSURE_SEARCH_TIMEOUT_MS } = {}
) {
  const options = preflight(request);
  if (options) return options;
  if (request.method !== 'GET')
    return jsonError(405, 'Use GET for archive searches.', { Allow: 'GET, OPTIONS' });

  let upstream;
  try {
    const url = new URL(request.url);
    for (const key of ['ra', 'dec', 'fov'])
      if (!url.searchParams.has(key) || !url.searchParams.get(key).trim())
        throw new Error(`Missing ${key}.`);
    upstream = archiveSearchUrl(
      {
        ra: Number(url.searchParams.get('ra')),
        dec: Number(url.searchParams.get('dec')),
        fov: Number(url.searchParams.get('fov')),
      },
      url.searchParams.get('collection') || 'spherex_dr1'
    );
  } catch (error) {
    return jsonError(400, error.message);
  }

  const lifecycle = requestController(request, timeoutMs);
  try {
    const response = await fetchImpl(upstream, {
      signal: lifecycle.controller.signal,
      redirect: 'error',
      headers: {
        Accept: 'text/tab-separated-values',
        'User-Agent': 'Parallax-SPHEREx/1.0',
      },
    });
    if (!response.ok) throw new Error(`IRSA returned HTTP ${response.status}.`);
    return new Response(await response.text(), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/tab-separated-values; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.warn('SPHEREx archive search failed.', {
      message: error instanceof Error ? error.message : 'Unknown upstream failure.',
      timedOut: lifecycle.didTimeOut(),
    });
    return jsonError(
      502,
      lifecycle.didTimeOut()
        ? 'IRSA archive search timed out. Please retry.'
        : 'IRSA is unavailable or the search failed. Please retry.'
    );
  } finally {
    lifecycle.dispose();
  }
}
