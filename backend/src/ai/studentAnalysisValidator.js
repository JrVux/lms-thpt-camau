import { STUDENT_ANALYSIS_SCHEMA, STUDENT_ANALYSIS_SCHEMA_VERSION } from './studentAnalysisSchema.js';

export class StudentAnalysisValidationError extends Error {
  constructor(issues) {
    super(issues.join(' '));
    this.name = 'StudentAnalysisValidationError';
    this.issues = issues;
    this.code = 'AI_ANALYSIS_INVALID';
  }
}

const TRAIT_CLAIMS = [
  /thông minh/i, /chăm chỉ/i, /lưu manh/i, /lười/i, /học sinh giỏi/i, /kém cỏi/i,
  /intelligent/i, /lazy/i, / diligent/i, /attitude/i, /personality/i, /talent/i,
];

const PII_LABELS = [
  /"email"/i, /"full_name"/i, /"username"/i, /"class_name"/i, /"teacher"/i,
  /@/,
];

const MAX_TEXT = 1000;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const collectRefs = (value, refs = new Set()) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRefs(item, refs));
  } else if (isObject(value)) {
    for (const [key, val] of Object.entries(value)) {
      if (key === 'evidence_refs' && Array.isArray(val)) val.forEach((r) => refs.add(String(r)));
      else collectRefs(val, refs);
    }
  }
  return refs;
};

const checkEvidenceItem = (item, label, allowed, issues) => {
  if (!isObject(item)) { issues.push(`${label} phải là đối tượng.`); return; }
  if (typeof item.text !== 'string' || !item.text.trim()) issues.push(`${label}.text trống.`);
  if (item.text && item.text.length > MAX_TEXT) issues.push(`${label}.text quá dài.`);
  if (!Array.isArray(item.evidence_refs)) issues.push(`${label}.evidence_refs phải là mảng.`);
  else {
    for (const ref of item.evidence_refs) {
      if (!allowed.has(String(ref))) issues.push(`${label} tham chiếu bằng chứng không tồn tại: ${ref}.`);
    }
  }
  if (!['low', 'medium', 'high'].includes(item.confidence)) issues.push(`${label}.confidence không hợp lệ.`);
};

const validateTeacherReport = (report, allowed, issues) => {
  if (!isObject(report)) { issues.push('teacher_report phải là đối tượng.'); return; }
  const textFields = ['summary', 'trend_interpretation', 'warnings'];
  for (const field of textFields) {
    if (field !== 'warnings' && (typeof report[field] !== 'string' || !report[field].trim())) issues.push(`teacher_report.${field} trống.`);
    if (report[field] && report[field].length > MAX_TEXT) issues.push(`teacher_report.${field} quá dài.`);
  }
  if (!Array.isArray(report.strengths) || report.strengths.length < 2 || report.strengths.length > 4) issues.push('teacher_report.strengths phải từ 2 đến 4.');
  (report.strengths ?? []).forEach((item, i) => checkEvidenceItem(item, `teacher_report.strengths[${i}]`, allowed, issues));
  if (!Array.isArray(report.reinforcement_areas) || report.reinforcement_areas.length < 2 || report.reinforcement_areas.length > 4) issues.push('teacher_report.reinforcement_areas phải từ 2 đến 4.');
  (report.reinforcement_areas ?? []).forEach((item, i) => checkEvidenceItem(item, `teacher_report.reinforcement_areas[${i}]`, allowed, issues));
  if (!Array.isArray(report.priority_goals) || report.priority_goals.length < 2 || report.priority_goals.length > 3) issues.push('teacher_report.priority_goals phải từ 2 đến 3.');
  (report.priority_goals ?? []).forEach((item, i) => {
    if (!isObject(item) || typeof item.goal !== 'string' || !item.goal.trim()) issues.push(`teacher_report.priority_goals[${i}].goal trống.`);
    if (!Array.isArray(item?.evidence_refs)) issues.push(`teacher_report.priority_goals[${i}].evidence_refs phải là mảng.`);
  });
  if (Array.isArray(report.common_errors)) {
    report.common_errors.forEach((item, i) => {
      if (!isObject(item) || typeof item.error !== 'string' || !item.error.trim()) issues.push(`teacher_report.common_errors[${i}].error trống.`);
      if (!isObject(item) || typeof item.possible_knowledge_cause !== 'string' || !item.possible_knowledge_cause.trim()) issues.push(`teacher_report.common_errors[${i}].possible_knowledge_cause trống.`);
    });
  }
  if (!Array.isArray(report.insufficient_evidence)) issues.push('teacher_report.insufficient_evidence phải là mảng.');
};

const validateStudentReport = (report, issues) => {
  if (!isObject(report)) { issues.push('student_report phải là đối tượng.'); return; }
  for (const field of ['doing_well', 'practice_more', 'two_week_goals']) {
    if (typeof report[field] !== 'string' || !report[field].trim()) issues.push(`student_report.${field} trống.`);
    if (report[field] && report[field].length > MAX_TEXT) issues.push(`student_report.${field} quá dài.`);
  }
  if (!Array.isArray(report.steps) || report.steps.length < 1 || report.steps.length > 8) issues.push('student_report.steps phải từ 1 đến 8.');
  (report.steps ?? []).forEach((step, i) => { if (typeof step !== 'string' || !step.trim()) issues.push(`student_report.steps[${i}] trống.`); });
};

const scanBanned = (value, issues) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const pattern of PII_LABELS) if (pattern.test(text)) issues.push('Phát hiện nhãn hoặc dữ liệu định danh bị cấm.');
  for (const pattern of TRAIT_CLAIMS) if (pattern.test(text)) issues.push('Phát hiện phát biểu bị cấm về thái độ/tính cách.');
};

export const validateStudentAnalysis = (value, allowedEvidenceIds) => {
  const allowed = new Set((allowedEvidenceIds ?? []).map(String));
  if (value === null || typeof value === 'undefined') throw new StudentAnalysisValidationError(['Kết quả AI rỗng.']);
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { const e = new StudentAnalysisValidationError(['JSON không hợp lệ.']); e.candidate = value; throw e; }
  }
  if (!isObject(parsed)) throw new StudentAnalysisValidationError(['Kết quả AI không phải đối tượng.']);
  const present = Object.keys(parsed);
  for (const key of present) {
    if (!(key in STUDENT_ANALYSIS_SCHEMA.properties)) throw new StudentAnalysisValidationError([`Trường không cho phép: ${key}.`]);
  }
  for (const key of STUDENT_ANALYSIS_SCHEMA.required) {
    if (!(key in parsed)) throw new StudentAnalysisValidationError([`Thiếu trường bắt buộc: ${key}.`]);
  }
  const issues = [];
  validateTeacherReport(parsed.teacher_report, allowed, issues);
  validateStudentReport(parsed.student_report, issues);
  scanBanned(parsed, issues);
  if (issues.length) { const e = new StudentAnalysisValidationError([...new Set(issues)]); e.candidate = parsed; throw e; }
  const refsUsed = collectRefs(parsed);
  for (const ref of refsUsed) {
    if (!allowed.has(ref)) throw new StudentAnalysisValidationError([`Mã bằng chứng không tồn tại: ${ref}.`]);
  }
  return {
    teacher_report: parsed.teacher_report,
    student_report: parsed.student_report,
    schema_version: STUDENT_ANALYSIS_SCHEMA_VERSION,
  };
};
