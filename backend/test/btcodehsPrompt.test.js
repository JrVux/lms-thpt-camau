import test from 'node:test';import assert from 'node:assert/strict';import {buildAssignmentPrompt} from '../src/ai/btcodehsPrompt.js';
test('builds versioned prompt without identity fields',()=>{const p=buildAssignmentPrompt({request:'Tạo bài vòng lặp',subject:'python',difficulty:2});assert.match(p.system,/BTcodehs/);assert.match(p.user,/vòng lặp/);assert.doesNotMatch(p.user,/teacherId|email|className/)});
test('includes SQL rules',()=>assert.match(buildAssignmentPrompt({request:'Lọc dữ liệu',subject:'sql'}).system,/setup_sql.*mảng hai chiều/s));
test('includes HTML rubric',()=>assert.match(buildAssignmentPrompt({request:'Trang web',subject:'html'}).system,/selector.*30%/s));
test('rejects blank and oversized input',()=>{assert.throws(()=>buildAssignmentPrompt({request:' '}),/trống/);assert.throws(()=>buildAssignmentPrompt({request:'x'.repeat(12001)}),/12000/)});
test('spells out the complete JSON contract for models without schema support',()=>{const p=buildAssignmentPrompt({request:'Bài vòng lặp',subject:'python'}).system;for(const field of ['"type"','"grade"','"solution_code"','"test_cases"','"competencies"'])assert.match(p,new RegExp(field))});
