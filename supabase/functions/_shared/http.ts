export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const json = (data: any, status = 200): Response => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};

export const functionError = (err: any, functionName = 'EdgeFunction'): Response => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const code = err?.code || (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'SERVER_ERROR');
  const message = err?.message || 'Lỗi xử lý yêu cầu hệ thống.';

  if (status >= 500) {
    console.error(`[${functionName}] Error [${code}]:`, err);
  }

  return json({ error: { code, message } }, status);
};
