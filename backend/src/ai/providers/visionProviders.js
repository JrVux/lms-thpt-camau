export const createOpenRouterVisionProvider = ({ apiKey, fetchImpl = fetch } = {}) => ({
  isConfigured: Boolean(apiKey),
  async generateCaption(imagePath) {
    const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen/qwen-vl-plus:free',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Mô tả nội dung hình ảnh này bằng tiếng Việt, tập trung vào sơ đồ, code, hoặc nội dung học tập. Trả lời ngắn gọn trong 2-3 câu.' }, { type: 'image_url', image_url: { url: imagePath } }] },
        ],
      }),
    });
    if (!response.ok) throw Object.assign(new Error(`OpenRouter Vision error: ${response.status}`), { code: 'VISION_ERROR' });
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Không thể mô tả ảnh';
  },
});
