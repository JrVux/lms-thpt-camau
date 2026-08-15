import { SUBJECT_GRADE,TEST_KINDS } from './assignmentDraftSchema.js';
export class AssignmentDraftValidationError extends Error{constructor(issues){super(issues.join(' '));this.name='AssignmentDraftValidationError';this.issues=issues;this.code='AI_OUTPUT_INVALID'}}
const ascii=/^[\x00-\x7F]+$/;
export const validateAndNormalizeDraft=(raw,expectedSubject)=>{
 const issues=[]; if(!raw||typeof raw!=='object') throw new AssignmentDraftValidationError(['Dữ liệu AI không hợp lệ.']);
 const type=String(raw.type||'').toLowerCase();
 if(!SUBJECT_GRADE[type]) issues.push('Không xác định được môn.');
 if(expectedSubject&&type!==expectedSubject) issues.push('Môn được tạo không khớp môn giáo viên chọn.');
 if(SUBJECT_GRADE[type]&&String(raw.grade)!==SUBJECT_GRADE[type]) issues.push('Môn và khối không khớp.');
 for(const key of ['title','description','starter_code','solution_code']) if(!String(raw[key]||'').trim()) issues.push(`Thiếu ${key}.`);
 const tests=Array.isArray(raw.test_cases)?raw.test_cases:[];
 for(const kind of TEST_KINDS) if(!tests.some(x=>x.test_kind===kind)) issues.push(`Thiếu test ${kind==='anti_hardcode'?'chống hardcode':kind==='boundary'?'biên':'thường'}.`);
 const names=new Set(); for(const tc of tests){const n=String(tc.test_name||'');if(!n||!ascii.test(n)||names.has(n))issues.push('test_name phải không dấu và không trùng.');names.add(n)}
 if(tests.reduce((s,x)=>s+Number(x.points||0),0)!==Number(raw.max_score)) issues.push('Tổng điểm test không khớp tổng điểm bài.');
 if(type==='python'&&tests.some(x=>String(x.input_data||''))&&new Set(tests.map(x=>String(x.input_data||''))).size<2) issues.push('Bài Python dùng input cần ít nhất hai bộ input.');
 if(type==='sql'){if(!String(raw.setup_sql||'').trim())issues.push('SQL bắt buộc có setup_sql.');for(const tc of tests){try{const v=JSON.parse(tc.expected_output);if(!Array.isArray(v)||v.some(r=>!Array.isArray(r)))issues.push('SQL expected_output phải là mảng hai chiều.')}catch{issues.push('SQL expected_output phải là JSON hợp lệ.')}}}
  if(type==='html'&&tests.some(x=>!String(x.selector||x.expected_output||'').trim()))issues.push('HTML cần selector hợp lệ.');
  if(type==='python'){const tc=String(raw.test_code||'');if(!tc.trim())issues.push('Python bắt buộc có test_code dạng PythonTestSuite.');if(tc.trim()&&(!/class\s+\w+\s*\(PythonTestSuite\)/.test(tc)||!/expect\(/.test(tc)))issues.push('Python test_code phải chứa class kế thừa PythonTestSuite và expect(...).');}
  else if(String(raw.test_code||'').trim())issues.push(`${type} không được có test_code.`);
 if(issues.length)throw new AssignmentDraftValidationError([...new Set(issues)]);
 const draft={...raw,type,grade:SUBJECT_GRADE[type],title:String(raw.title).trim(),description:String(raw.description).trim(),test_cases:tests.map(x=>({...x,points:Number(x.points)})),max_score:Number(raw.max_score)};
 if(type==='html'&&!draft.description.includes('Tiêu chí giáo viên chấm thủ công — 30%')) draft.description+='\n\n## Tiêu chí giáo viên chấm thủ công — 30%\n- Bố cục, màu sắc và tính thẩm mỹ phù hợp.';
 return {draft,warnings:[]};
};
