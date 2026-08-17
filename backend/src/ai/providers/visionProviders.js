export const createCloudflareVisionProvider = ({ apiKey, accountId, fetchImpl = fetch } = {}) => ({
  isConfigured: Boolean(apiKey && accountId),
  async generateCaption(imagePath) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: [{ path: imagePath }], prompt: 'Mô tả nội dung của hình ảnh này bằng tiếng Việt, tập trung vào sơ đồ, code, hoặc nội dung học tập.' }),
    });
    if (!response.ok) throw Object.assign(new Error(`Vision API error: ${response.status}`), { code: 'VISION_ERROR' });
    const data = await response.json();
    return data.result?.description || 'Không thể mô tả ảnh';
  },
});

export const createGeminiVisionProvider = ({ apiKey, fetchImpl = fetch } = {}) => ({
  isConfigured: Boolean(apiKey),
  async generateCaption(imagePath) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Mô tả nội dung của hình ảnh này bằng tiếng Việt, tập trung vào sơ đồ, code, hoặc nội dung học tập. Trả lời ngắn gọn.` }, { inline_data: { mime_type: 'image/jpeg', data: imagePath } }] }],
      }),
    });
    if (!response.ok) throw Object.assign(new Error(`Gemini Vision API error: ${response.status}`), { code: 'GEMINI_VISION_ERROR' });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Không thể mô tả ảnh';
  },
});