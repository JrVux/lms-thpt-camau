import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAndNormalizeDraft } from '../src/ai/assignmentDraftValidator.js';

const base = (type='python') => ({
 title:'Tính tổng', type, grade:{python:'10',sql:'11',html:'12'}[type], difficulty:2,
 description:'Viết chương trình theo yêu cầu và xem ví dụ.', starter_code:'# Bắt đầu', solution_code:'print(3)',
 setup_sql:type==='sql'?'CREATE TABLE t(x int);':'', test_code:type==='python'?'class TinhTong(PythonTestSuite):\n    inputs=["4"]\n    def afterRun(self):\n        expect(student_output).to_contain("10").with_options(points=8, test_name="Truong_hop_thuong")':type==='html'?'':'', max_score:10,
 test_cases:[
  {test_name:'Truong_hop_thuong',test_kind:'normal',input_data:'1\n2',expected_output:type==='sql'?'[["1"]]':'3',points:4,selector:type==='html'?'h1':''},
  {test_name:'Truong_hop_bien',test_kind:'boundary',input_data:'0\n0',expected_output:type==='sql'?'[]':'0',points:3,selector:type==='html'?'main':''},
  {test_name:'Chong_hardcode',test_kind:'anti_hardcode',input_data:'2\n5',expected_output:type==='sql'?'[["2"]]':'7',points:3,selector:type==='html'?'a[href]':''}],
 competencies:[{code:type==='python'?'PY10.IO':type==='sql'?'SQL11.SELECT':'HTML12.STRUCTURE',difficulty:2,weight:1,reason:'Phù hợp'}]
});

test('normalizes valid Python and derives grade',()=>assert.equal(validateAndNormalizeDraft(base()).draft.grade,'10'));
test('rejects wrong grade',()=>assert.throws(()=>validateAndNormalizeDraft({...base(),grade:'11'}),/khối/));
test('rejects missing test kind',()=>{const x=base();x.test_cases=x.test_cases.slice(0,2);assert.throws(()=>validateAndNormalizeDraft(x),/chống hardcode/)});
test('rejects mismatched points',()=>assert.throws(()=>validateAndNormalizeDraft({...base(),max_score:20}),/Tổng điểm/));
test('requires SQL setup and rows',()=>{const x=base('sql');x.setup_sql='';assert.throws(()=>validateAndNormalizeDraft(x),/setup_sql/)});
test('adds HTML manual rubric',()=>assert.match(validateAndNormalizeDraft(base('html')).draft.description,/30%/));
test('rejects confirmed subject mismatch',()=>assert.throws(()=>validateAndNormalizeDraft(base(),'sql'),/không khớp/));
test('rejects Python without test_code',()=>assert.throws(()=>validateAndNormalizeDraft({...base(),test_code:''}),/test_code/));
test('rejects Python test_code without PythonTestSuite/expect',()=>assert.throws(()=>validateAndNormalizeDraft({...base(),test_code:'print(1)'}),/PythonTestSuite|expect/));
test('rejects test_code on non-Python',()=>assert.throws(()=>validateAndNormalizeDraft({...base('sql'),test_code:'class X(PythonTestSuite):\n    pass'}),/không được có test_code/));
