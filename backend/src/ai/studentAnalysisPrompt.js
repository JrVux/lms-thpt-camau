import { STUDENT_ANALYSIS_PROMPT_VERSION } from './studentAnalysisSchema.js';

export const PROMPT_VERSION = STUDENT_ANALYSIS_PROMPT_VERSION;

const SAFETY_RULES = [
  'Chỉ sử dụng bằng chứng đã cung cấp trong gói dữ liệu.',
  'Không suy đoán thái độ, trí thông minh, tính cách, hoàn cảnh gia đình hay nguyên nhân ngoài dữ liệu học tập.',
  'Không được tự thay đổi điểm số, mức thành thạo hay xu hướng do hệ thống tính.',
  'Mọi kết luận quan trọng phải gắn với ít nhất một mã bằng chứng (ví dụ E01, E02) nằm trong danh sách evidence_refs.',
  'Khi dữ liệu yếu hoặc mâu thuẫn, hãy ghi rõ "Chưa đủ dữ liệu để kết luận" và đưa vào insufficient_evidence thay vì đưa ra kết luận chắc chắn.',
  'Chỉ trả về đối tượng JSON, không thêm văn bản giải thích bên ngoài JSON.',
  'Không bao giờ đưa tên, email, tài khoản, tên lớp hay tên trường vào kết quả.',
];

export const buildStudentAnalysisPrompt = (bundle) => {
  if (!bundle || typeof bundle !== 'object') throw Object.assign(new Error('Gói bằng chứng không hợp lệ.'), { code: 'INVALID_BUNDLE' });
  const system = [
    'Bạn là trợ lý phân tích bài làm cho giáo viên lập trình THPT.',
    `Phiên bản prompt: ${PROMPT_VERSION}.`,
    'Nhiệm vụ: từ gói bằng chứng ẩn danh của một học sinh, tạo hai bản nhận xét có cấu trúc.',
    ...SAFETY_RULES,
  ].join('\n');
  const user = [
    'Gói bằng chứng ẩn danh:',
    JSON.stringify(bundle, null, 2),
    '',
    'Hãy tạo JSON theo đúng schema: bản teacher_report (tóm tắt, 2-4 điểm mạnh, 2-4 nội dung củng cố, lỗi thường gặp, diễn giải xu hướng, năng lực chưa đủ dữ liệu, 2-3 mục tiêu ưu tiên, cảnh báo) và bản student_report (điều đang làm tốt, cần luyện thêm, mục tiêu hai tuần, các bước ngắn gọn tích cực).',
  ].join('\n');
  return { system, user };
};

export const buildStudentAnalysisRepairPrompt = ({ bundle, invalidOutput, issues }) => {
  if (!bundle || typeof bundle !== 'object') throw Object.assign(new Error('Gói bằng chứng không hợp lệ.'), { code: 'INVALID_BUNDLE' });
  if (!Array.isArray(issues) || !issues.length) throw Object.assign(new Error('Cần cung cấp lỗi để sửa.'), { code: 'REPAIR_NEEDS_ISSUES' });
  const system = [
    'Bạn là trợ lý sửa lỗi cho kết quả phân tích học sinh.',
    ...SAFETY_RULES,
    'Chỉ trả về JSON đã sửa, không thêm giải thích.',
  ].join('\n');
  const user = [
    'Gói bằng chứng:',
    JSON.stringify(bundle, null, 2),
    '',
    'Kết quả trước không hợp lệ. Các lỗi cần sửa:',
    issues.map((i) => `- ${i}`).join('\n'),
    '',
    'Đây là output lỗi (đã loại bỏ thông tin định danh):',
    JSON.stringify(invalidOutput ?? {}).slice(0, 4000),
    '',
    'Hãy trả về JSON đã sửa theo đúng schema.',
  ].join('\n');
  return { system, user };
};
