import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpherexTransport } from '../src/api/spherexTransport.js';

test('SPHEREx transport defaults to same-origin Node API without API key headers', async () => {
  let call;
  const signal = new AbortController().signal;
  const transport = createSpherexTransport({
    mode: 'node',
    origin: 'http://localhost:5173',
    fetchImpl: async (url, init) => {
      call = { url, init };
      return new Response('ok');
    },
  });
  await transport.request('spherex-exposures', { ra: 10, dec: 20, fov: 2 }, { signal });
  assert.equal(call.url.href, 'http://localhost:5173/api/spherex-exposures?ra=10&dec=20&fov=2');
  assert.equal(call.init.signal, signal);
  assert.equal(call.init.headers.has('apikey'), false);
});

test('SPHEREx transport targets public Edge Functions with publishable key on apikey', async () => {
  let call;
  const transport = createSpherexTransport({
    mode: 'supabase',
    supabaseUrl: 'https://project-ref.supabase.co/rest/v1/',
    publishableKey: 'sb_publishable_example',
    fetchImpl: async (url, init) => {
      call = { url, init };
      return new Response(new Uint8Array());
    },
  });
  await transport.request('spherex-image', { url: 'https://irsa.ipac.caltech.edu/a.fits' });
  assert.equal(call.url.origin, 'https://project-ref.supabase.co');
  assert.equal(call.url.pathname, '/functions/v1/spherex-image');
  assert.equal(call.url.searchParams.get('url'), 'https://irsa.ipac.caltech.edu/a.fits');
  assert.equal(call.init.headers.get('apikey'), 'sb_publishable_example');
  assert.equal(call.init.headers.has('authorization'), false);
});

test('SPHEREx transport rejects unknown modes, functions, and incomplete Supabase configuration', () => {
  assert.throws(() => createSpherexTransport({ mode: 'other' }), /node or supabase/);
  assert.throws(() => createSpherexTransport({ mode: 'supabase' }), /requires/);
  const transport = createSpherexTransport({ mode: 'node' });
  assert.throws(() => transport.endpoint('arbitrary-proxy'), /Unsupported/);
});
