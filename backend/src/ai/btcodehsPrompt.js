export const PROMPT_VERSION = 'btcodehs-v1';
const refs = {
  python: 'Python lớp 10: input/print, 4 dấu cách, tối thiểu hai input khác nhau; expected_output là text.',
  sql: 'SQL lớp 11: bắt buộc setup_sql; expected_output là JSON mảng hai chiều; giữ thứ tự ORDER BY.',
  html: 'HTML/CSS lớp 12: expected_output/selector là CSS selector; autograder chỉ kiểm tra thẻ; Description có rubric thẩm mỹ thủ công 30%.',
};
const clean = (value, max = 12000) => { const text = String(value || '').trim(); if (!text) throw new Error('Yêu cầu không được để trống.'); if (text.length > max) throw new Error(`Yêu cầu tối đa ${max} ký tự.`); return text; };
const contract = '{"title":string,"type":"python"|"sql"|"html","grade":"10"|"11"|"12","difficulty":1..5,"description":string,"starter_code":string,"solution_code":string,"setup_sql":string,"test_code":string,"max_score":integer,"test_cases":[{"test_name":string,"test_kind":"normal"|"boundary"|"anti_hardcode","input_data":string,"expected_output":string,"selector":string,"points":integer,"competency_codes":[string]}],"competencies":[{"code":string,"difficulty":1..5,"weight":number,"reason":string}]}';
export const buildAssignmentPrompt = (input) => ({
  version: PROMPT_VERSION,
  system: `Bạn là BTcodehs. Trả duy nhất một JSON object, không Markdown, đúng chính xác contract: ${contract}. Description tiếng Việt; starter_code có gợi ý nhưng không lộ lời giải; solution_code ngắn gọn. Có đủ 3 test_kind; test_name không dấu; tổng points bằng max_score. Môn và khối phải đúng yêu cầu. ${input.subject ? refs[input.subject] : Object.values(refs).join(' ')}`,
  user: `Yêu cầu/bài mẫu: ${clean(input.request)}\nMôn: ${input.subject || 'tự nhận diện'}\nĐộ khó: ${input.difficulty || 'tự chọn'}\nBổ sung: ${String(input.additional_requirements || '').slice(0, 2000)}`,
});
export const buildRepairPrompt = ({ input, invalidOutput, issues }) => ({ ...buildAssignmentPrompt(input), user: `${buildAssignmentPrompt(input).user}\nSửa JSON sau theo lỗi: ${issues.join('; ')}\nJSON lỗi: ${JSON.stringify(invalidOutput).slice(0, 16000)}` });
