import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMappingPayload } from '../src/utils/competency.js';

test('buildMappingPayload binds selected tests and numeric fields', () => {
  assert.deepEqual(buildMappingPayload('a1', [{
    competency_id: 'c1', test_case_id: 't1', difficulty: '2', weight: '1', approved: true,
  }]), [{
    assignment_id: 'a1', competency_id: 'c1', test_case_id: 't1',
    difficulty: 2, weight: 1, status: 'approved',
  }]);
});

test('buildMappingPayload supports assignment-level Python mappings', () => {
  assert.equal(buildMappingPayload('a1', [{
    competency_id: 'c1', test_case_id: '', difficulty: 3, weight: 1, approved: false,
  }])[0].test_case_id, null);
});
