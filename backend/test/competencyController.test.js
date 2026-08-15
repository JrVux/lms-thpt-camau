import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'test-key';

const { createCompetencyController } = await import('../src/controllers/competencyController.js');

const responseRecorder = () => ({
  body: null,
  statusCode: 200,
  json(value) { this.body = value; return this; },
  status(value) { this.statusCode = value; return this; },
});

test('replace mappings passes only the authenticated teacher identity', async () => {
  const calls = [];
  const controller = createCompetencyController({
    async replaceAssignmentMappings(args) { calls.push(args); return [{ id: 'm1' }]; },
  });
  const req = { user: { id: 'teacher-1' }, params: { assignmentId: 'a1' }, body: { mappings: [] } };
  const res = responseRecorder();
  let forwarded;
  await controller.replaceAssignmentMappings(req, res, (error) => { forwarded = error; });
  assert.equal(forwarded, undefined);
  assert.deepEqual(calls[0], { teacherId: 'teacher-1', assignmentId: 'a1', mappings: [] });
  assert.equal(res.body[0].id, 'm1');
});

test('forwards service errors without emitting success', async () => {
  const controller = createCompetencyController({
    async getClassDashboard() { throw new Error('Không có quyền'); },
  });
  const req = { user: { id: 'teacher-1' }, params: { id: 'c1' } };
  const res = responseRecorder();
  let forwarded;
  await controller.getClassDashboard(req, res, (error) => { forwarded = error; });
  assert.match(forwarded.message, /Không có quyền/);
  assert.equal(res.body, null);
});
