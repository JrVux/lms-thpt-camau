import 'dotenv/config';
import { createAIGateway } from '../src/services/aiGateway.js';
import { createOpenRouterProvider } from '../src/ai/providers/openRouterProvider.js';
import { createGeminiProvider } from '../src/ai/providers/geminiProvider.js';

const gateway = createAIGateway({
  openRouter: createOpenRouterProvider({ apiKey: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL }),
  gemini: createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL }),
  timeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS) || 45000,
});

const requests = [
  { subject: 'python', difficulty: 2, request: 'Tạo bài Python lớp 10 dùng vòng lặp for để tính tổng các số từ 1 đến n.' },
  { subject: 'sql', difficulty: 2, request: 'Tạo bài SQL lớp 11 dùng WHERE và ORDER BY để lọc học sinh có điểm từ 8 trở lên.' },
  { subject: 'html', difficulty: 2, request: 'Tạo bài HTML/CSS lớp 12 xây dựng trang giới thiệu bản thân có tiêu đề, ảnh và liên kết.' },
];

for (const input of requests.filter((item) => !process.argv[2] || item.subject === process.argv[2])) {
  try {
    const result = await gateway.generateAssignment(input);
    console.log(JSON.stringify({ subject: input.subject, ok: true, provider: result.provider, fallback: result.fallback_used, tests: result.draft.test_cases.length, max_score: result.draft.max_score, competencies: result.draft.competencies.length }));
  } catch (error) {
    console.log(JSON.stringify({ subject: input.subject, ok: false, code: error.code || error.name, message: error.message, issues: error.issues || [] }));
    process.exitCode = 1;
  }
}
