import test from 'node:test';
import assert from 'node:assert/strict';
import { globalSearch } from '../src/services/searchService.js';

test('globalSearch returns empty results for empty query', async () => {
  const res = await globalSearch({ userId: 'u1', role: 'teacher', query: '' });
  assert.deepEqual(res, { classes: [], assignments: [], topics: [], students: [] });
});
