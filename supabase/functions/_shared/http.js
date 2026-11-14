export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

export function preflight(request) {
  return request.method === 'OPTIONS'
    ? new Response(null, { status: 204, headers: corsHeaders })
    : null;
}

export function jsonError(status, message, extraHeaders = {}) {
  return Response.json(
    { error: message },
    {
      status,
      headers: { ...corsHeaders, ...extraHeaders },
    }
  );
}

export function requestController(request, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(request.signal?.reason);
  request.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Timed out', 'TimeoutError'));
  }, timeoutMs);
  return {
    controller,
    didTimeOut: () => timedOut,
    dispose() {
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', abort);
    },
  };
}
