const FUNCTION_NAMES = new Set(['spherex-exposures', 'spherex-image']);

function normalizeSupabaseUrl(value) {
  return value
    ?.trim()
    .replace(/\/rest\/v1\/?$/, '')
    .replace(/\/$/, '');
}

export function createSpherexTransport({
  mode = 'node',
  supabaseUrl,
  publishableKey,
  fetchImpl = fetch,
  origin = globalThis.location?.origin || 'http://localhost',
} = {}) {
  if (!['node', 'supabase'].includes(mode))
    throw new Error('VITE_SPHEREX_API_MODE must be node or supabase.');
  const root = normalizeSupabaseUrl(supabaseUrl);
  if (mode === 'supabase' && (!root || !publishableKey?.startsWith('sb_publishable_')))
    throw new Error(
      'Supabase SPHEREx mode requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
    );

  return {
    mode,
    endpoint(name) {
      if (!FUNCTION_NAMES.has(name)) throw new Error('Unsupported SPHEREx API function.');
      return mode === 'node' ? `/api/${name}` : `${root}/functions/v1/${name}`;
    },
    request(name, params, init = {}) {
      const url = new URL(this.endpoint(name), origin);
      url.search = new URLSearchParams(params).toString();
      const headers = new Headers(init.headers);
      if (mode === 'supabase') headers.set('apikey', publishableKey);
      return fetchImpl(url, { ...init, headers });
    },
  };
}

const env = import.meta.env || {};
export const spherexTransport = createSpherexTransport({
  mode: env.VITE_SPHEREX_API_MODE || 'node',
  supabaseUrl: env.VITE_SUPABASE_URL,
  publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
});
