// Supabase Edge Function: web-search
// Gọi Brave Search API free-tier khi RAG nội bộ không tìm thấy thông tin
// Chỉ bật khi flag use_web_search = true từ client

interface WebSearchRequest {
  query: string;
  count?: number;
}

interface WebSearchResponse {
  success: boolean;
  data?: {
    results: { title: string; url: string; snippet: string; }[];
    source: 'brave' | 'error';
  };
  error?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { query, count = 5 }: WebSearchRequest = await req.json();

    if (!query?.trim()) {
      return new Response(JSON.stringify({ success: false, error: 'Thiếu truy vấn tìm kiếm' }), { status: 400, headers });
    }

    const apiKey = Deno.env.get('BRAVE_SEARCH_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'Chưa cấu hình Brave Search API key' }), { status: 500, headers });
    }

    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query.trim());
    url.searchParams.set('count', String(Math.min(count, 10)));

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      return new Response(JSON.stringify({
        success: false,
        error: `Brave Search API error: ${response.status} ${errText.slice(0, 200)}`,
      }), { status: 502, headers });
    }

    const data = await response.json();
    const results = (data.web?.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.description || '',
    }));

    return new Response(JSON.stringify({
      success: true,
      data: { results, source: 'brave' },
    }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : 'Internal error',
    }), { status: 500, headers });
  }
});