import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'test-key';

const { createShareAssignmentsService } = await import('../src/services/assignmentService.js');

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.action = 'select';
    this.filters = [];
    this.selected = null;
    this.payload = null;
  }

  select(columns) {
    this.selected = columns;
    return this;
  }

  eq(column, value) {
    this.filters.push({ method: 'eq', column, value });
    return this;
  }

  in(column, value) {
    this.filters.push({ method: 'in', column, value });
    return this;
  }

  insert(payload) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  single() {
    return this.client.execute(this, true);
  }

  then(resolve, reject) {
    return this.client.execute(this, false).then(resolve, reject);
  }
}

const makeSupabase = ({ targetGrade = '10' } = {}) => {
  const calls = [];
  let assignmentSequence = 0;
  const client = {
    calls,
    from(table) {
      return new FakeQuery(client, table);
    },
    async execute(query, single) {
      calls.push({
        table: query.table,
        action: query.action,
        selected: query.selected,
        filters: query.filters,
        payload: query.payload,
        single,
      });

      if (query.action === 'insert' && query.table === 'assignments') {
        assignmentSequence += 1;
        return { data: { id: `copy-${assignmentSequence}` }, error: null };
      }
      if (query.action !== 'select') {
        return { data: null, error: null };
      }
      if (query.table === 'classes' && single) {
        return {
          data: { id: 'source', teacher_id: 'teacher-1', grade: '10' },
          error: null,
        };
      }
      if (query.table === 'classes') {
        return {
          data: [{ id: 'target', teacher_id: 'teacher-1', grade: targetGrade }],
          error: null,
        };
      }
      if (query.table === 'assignments') {
        return {
          data: [{
            id: 'assignment-1',
            class_id: 'source',
            title: 'Bài tập',
            is_published: true,
            test_cases: [{
              id: 'test-1',
              assignment_id: 'assignment-1',
              expected_output: 'ok',
              points: 2,
              order_index: 0,
            }],
          }],
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };
  return client;
};

test('normalizes IDs, queries grade, and copies through the Supabase adapter', async () => {
  const fakeSupabase = makeSupabase();
  const shareAssignments = createShareAssignmentsService(fakeSupabase);

  const result = await shareAssignments(
    'source',
    ['target', 'target'],
    ['assignment-1', 'assignment-1'],
    'teacher-1'
  );

  assert.equal(result.copied, 1);
  assert.equal(result.failed, 0);
  const classCalls = fakeSupabase.calls.filter((call) => call.table === 'classes');
  assert.equal(classCalls[0].selected, 'id, teacher_id, grade');
  assert.equal(classCalls[1].selected, 'id, teacher_id, grade');
  assert.deepEqual(
    classCalls[1].filters.find((filter) => filter.method === 'in').value,
    ['target']
  );
  const assignmentRead = fakeSupabase.calls.find(
    (call) => call.table === 'assignments' && call.action === 'select' && !call.single
  );
  assert.deepEqual(
    assignmentRead.filters.find((filter) => filter.method === 'in').value,
    ['assignment-1']
  );
  assert.equal(
    fakeSupabase.calls.filter(
      (call) => call.table === 'assignments' && call.action === 'insert'
    ).length,
    1
  );
  assert.equal(
    fakeSupabase.calls.filter(
      (call) => call.table === 'test_cases' && call.action === 'insert'
    ).length,
    1
  );
});

test('rejects a cross-grade target before inserting assignments', async () => {
  const fakeSupabase = makeSupabase({ targetGrade: '11' });
  const shareAssignments = createShareAssignmentsService(fakeSupabase);

  await assert.rejects(
    shareAssignments('source', ['target'], ['assignment-1'], 'teacher-1'),
    /cùng khối/
  );
  assert.equal(
    fakeSupabase.calls.filter((call) => call.action === 'insert').length,
    0
  );
});
