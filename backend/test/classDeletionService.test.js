import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-key';

const { parseClassDeletionResult } = await import('../src/services/classService.js');

test('maps deletion RPC statuses to stable service outcomes', () => {
  assert.deepEqual(parseClassDeletionResult({ status: 'deleted', id: 'c1' }), {
    success: true,
    id: 'c1',
  });
  assert.throws(
    () => parseClassDeletionResult({ status: 'not_found' }),
    /Không tìm thấy lớp/
  );
  assert.throws(
    () => parseClassDeletionResult({ status: 'forbidden' }),
    /không có quyền xóa lớp/
  );
  assert.throws(
    () => parseClassDeletionResult({ status: 'unexpected' }),
    /Xóa lớp thất bại/
  );
});
