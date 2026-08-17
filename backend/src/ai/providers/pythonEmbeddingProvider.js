const EMBEDDING_DIM = 1536;

const assertDim = (vec) => {
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
    throw Object.assign(
      new Error(`Embedding phải có ${EMBEDDING_DIM} chiều, nhận ${Array.isArray(vec) ? vec.length : typeof vec}`),
      { code: 'EMBEDDING_DIM_MISMATCH' }
    );
  }
  return vec;
};

export const createGeminiEmbeddingProvider = ({ apiKey, fetchImpl = fetch } = {}) => ({
  isConfigured: Boolean(apiKey),
  async generateEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text: String(text).substring(0, 8000) }] },
        outputDimensionality: EMBEDDING_DIM,
      }),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw Object.assign(new Error(`Gemini Embedding API error: ${response.status} ${errText.slice(0, 150)}`), { code: 'EMBEDDING_ERROR' });
    }
    const data = await response.json();
    const vec = data.embedding?.values;
    return assertDim(vec);
  },
});

export const createOpenRouterEmbeddingProvider = ({ apiKey, model = 'openai/text-embedding-3-small', fetchImpl = fetch } = {}) => ({
  isConfigured: Boolean(apiKey),
  async generateEmbedding(text) {
    const response = await fetchImpl('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: String(text).substring(0, 8000) }),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw Object.assign(new Error(`OpenRouter Embedding API error: ${response.status} ${errText.slice(0, 150)}`), { code: 'EMBEDDING_ERROR' });
    }
    const data = await response.json();
    const vec = data.data?.[0]?.embedding;
    return assertDim(vec);
  },
});