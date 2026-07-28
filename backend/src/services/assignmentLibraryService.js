const SCORING_FIELDS = new Set([
  'starter_code',
  'setup_sql',
  'test_code',
  'solution_code',
  'max_score',
]);

const WRITABLE_FIELDS = new Set([
  'title',
  'description',
  'category',
  'type',
  'starter_code',
  'solution_code',
  'setup_sql',
  'test_code',
  'max_score',
]);

const throwDbError = (error) => {
  if (error) throw new Error(error.message);
};

const ownedAssignment = async (db, teacherId, assignmentId) => {
  const { data, error } = await db
    .from('assignments')
    .select('*')
    .eq('id', assignmentId)
    .eq('teacher_id', teacherId)
    .eq('is_library', true)
    .maybeSingle();
  throwDbError(error);
  if (!data) {
    const notFound = new Error('Không tìm thấy bài tập trong kho.');
    notFound.code = 'NOT_FOUND';
    throw notFound;
  }
  return data;
};

export const createAssignmentLibraryService = (db) => ({
  async list({ teacherId, category }) {
    let query = db
      .from('assignments')
      .select('*, assignment_deliveries!assignment_deliveries_library_assignment_id_fkey(count)')
      .eq('teacher_id', teacherId)
      .eq('is_library', true)
      .order('updated_at', { ascending: false });
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    throwDbError(error);
    return (data ?? []).map(({ assignment_deliveries: deliveryCounts, ...assignment }) => ({
      ...assignment,
      delivery_count: deliveryCounts?.[0]?.count ?? 0,
    }));
  },

  async create({ teacherId, input }) {
    const payload = Object.fromEntries(
      Object.entries(input).filter(([field]) => WRITABLE_FIELDS.has(field))
    );
    const { data, error } = await db
      .from('assignments')
      .insert([{
        ...payload,
        class_id: null,
        teacher_id: teacherId,
        is_library: true,
        content_version: 1,
      }])
      .select()
      .single();
    throwDbError(error);
    return data;
  },

  async get({ teacherId, assignmentId }) {
    const { data, error } = await db
      .from('assignments')
      .select('*, test_cases(*)')
      .eq('id', assignmentId)
      .eq('teacher_id', teacherId)
      .eq('is_library', true)
      .maybeSingle();
    throwDbError(error);
    if (!data) {
      const notFound = new Error('Không tìm thấy bài tập trong kho.');
      notFound.code = 'NOT_FOUND';
      throw notFound;
    }
    return data;
  },

  async update({ teacherId, assignmentId, input }) {
    const payload = Object.fromEntries(
      Object.entries(input).filter(([field]) => WRITABLE_FIELDS.has(field))
    );
    const scoringChanged = Object.keys(payload).some((field) => SCORING_FIELDS.has(field));
    if (scoringChanged) {
      const { data, error } = await db.rpc('update_assignment_content', {
        p_assignment_id: assignmentId,
        p_teacher_id: teacherId,
        p_updates: payload,
        p_library_only: true,
      });
      throwDbError(error);
      return data;
    }
    await ownedAssignment(db, teacherId, assignmentId);
    payload.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('assignments')
      .update(payload)
      .eq('id', assignmentId)
      .eq('teacher_id', teacherId)
      .eq('is_library', true)
      .select()
      .single();
    throwDbError(error);

    return data;
  },

  async replaceTestCases({ teacherId, assignmentId, testCases }) {
    const normalized = testCases.map((testCase, index) => ({
      ...testCase,
      order_index: testCase.order_index ?? index,
    }));
    const { data, error } = await db.rpc('replace_assignment_tests', {
      p_assignment_id: assignmentId,
      p_teacher_id: teacherId,
      p_test_cases: normalized,
    });
    throwDbError(error);
    return data;
  },
});
