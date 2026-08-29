process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';

import test from 'node:test';
import assert from 'node:assert/strict';
import { globalSearch } from '../src/services/searchService.js';

test('globalSearch returns empty results for empty query', async () => {
  const res = await globalSearch({ userId: 'u1', role: 'teacher', query: '' });
  assert.deepEqual(res, { classes: [], assignments: [], topics: [], students: [] });
});
