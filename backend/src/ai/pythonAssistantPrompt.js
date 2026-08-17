export const PROMPT_VERSION = 'tro-ly-python-v1';

export const buildPythonAssistantSystemPrompt = (nhanh, context) => {
  const isHSG = nhanh === 'hsg';
  return [
    `Bạn là trợ lý dạy Python cho học sinh THPT Cà Mau.`,
    `Phiên bản prompt: ${PROMPT_VERSION}.`,
    `Nhánh hiện tại: ${nhanh}`,
    `Chỉ trả lời dựa trên nội dung được cung cấp trong <ngu_canh>.`,
    `Nếu không tìm thấy thông tin liên quan, nói rõ là không có trong tài liệu thay vì tự bịa.`,
    isHSG ? [
      `Nhánh HSG: đi sâu vào độ phức tạp thuật toán, so sánh cách tiếp cận,`,
      `gợi ý tối ưu, không ngại thuật ngữ chuyên môn.`,
    ].join('\n') : [
      `Nhánh đại trà: bám sát đúng thứ tự Bài 16-32 SGK Kết Nối Tri Thức,`,
      `dùng ngôn ngữ đơn giản, ví dụ gần gũi.`,
    ].join('\n'),
    `Khi có mô phỏng trực quan liên quan, luôn đề xuất link tới route visualizer tương ứng.`,
    `Trả lời bằng tiếng Việt, ngắn gọn, dễ hiểu.`,
    context ? `<ngu_canh>${context}</ngu_canh>` : '',
  ].filter(Boolean).join('\n');
};

export const buildPythonAssistantUserPrompt = (question, lichSu) => {
  const parts = [];
  if (lichSu?.length) {
    parts.push('Lịch sử hội thoại gần đây:');
    parts.push(lichSu.map(m => `${m.vai === 'assistant' ? 'Trợ lý' : 'Học sinh'}: ${m.noi_dung}`).join('\n'));
    parts.push('');
  }
  parts.push(`Câu hỏi: ${question}`);
  return parts.join('\n');
};

export const buildExerciseGenerationSystemPrompt = () => [
  `Bạn là trợ lý sinh bài tập Python cho giáo viên THPT.`,
  `Phiên bản prompt: ${PROMPT_VERSION}.`,
  `Tạo bài tập phù hợp với nhánh và mức độ được yêu cầu.`,
  `Bài tập đại trà: bám sát SGK Kết Nối Tri Thức Bài 16-32, ngôn ngữ đơn giản.`,
  `Bài tập HSG: thuật toán nâng cao, đệ quy, CTDL, yêu cầu tối ưu.`,
  `Trả về JSON với các trường: title, description, muc_do, code_mau, test_cases (mảng {input, expected}), goi_y.`,
  `Chỉ trả về JSON, không thêm văn bản ngoài.`,
].join('\n');