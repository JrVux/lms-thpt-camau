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

const markLinkedSubmissionsForRegrade = async (db, assignmentId) => {
  const { data: deliveries, error: deliveryError } = await db
    .from('assignment_deliveries')
    .select('id')
    .eq('library_assignment_id', assignmentId)
    .eq('sync_mode', 'linked');
  throwDbError(deliveryError);

  const deliveryIds = (deliveries ?? []).map((delivery) => delivery.id);
  if (deliveryIds.length === 0) return;

  const { error } = await db
    .from('submissions')
    .update({ regrade_status: 'required', regrade_error: null })
    .in('delivery_id', deliveryIds);
  throwDbError(error);
};

export const createAssignmentLibraryService = (db) => ({
  async list({ teacherId, category }) {
    let query = db
      .from('assignments')
      .select('*, assignment_deliveries(count)')
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
    const current = await ownedAssignment(db, teacherId, assignmentId);
    const payload = Object.fromEntries(
      Object.entries(input).filter(([field]) => WRITABLE_FIELDS.has(field))
    );
    const scoringChanged = Object.keys(payload).some((field) => SCORING_FIELDS.has(field));
    if (scoringChanged) payload.content_version = current.content_version + 1;
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

    if (scoringChanged) await markLinkedSubmissionsForRegrade(db, assignmentId);
    return data;
  },

  async replaceTestCases({ teacherId, assignmentId, testCases }) {
    const current = await ownedAssignment(db, teacherId, assignmentId);

    const { data: oldTestCases, error: oldTestError } = await db
      .from('test_cases')
      .select('id')
      .eq('assignment_id', assignmentId);
    throwDbError(oldTestError);

    let insertedTestCases = [];
    if (testCases.length > 0) {
      const rows = testCases.map((testCase, index) => ({
        ...testCase,
        assignment_id: assignmentId,
        order_index: testCase.order_index ?? index,
      }));
      const { data, error: insertError } = await db.from('test_cases').insert(rows).select('id');
      throwDbError(insertError);
      insertedTestCases = data ?? [];
    }

    const maxScore = testCases.reduce((sum, testCase) => sum + Number(testCase.points ?? 1), 0);
    const { data, error } = await db
      .from('assignments')
      .update({
        max_score: maxScore,
        content_version: current.content_version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
      .eq('teacher_id', teacherId)
      .select()
      .single();
    if (error) {
      const insertedIds = insertedTestCases.map((testCase) => testCase.id);
      if (insertedIds.length > 0) await db.from('test_cases').delete().in('id', insertedIds);
      throwDbError(error);
    }

    await markLinkedSubmissionsForRegrade(db, assignmentId);
    const oldIds = (oldTestCases ?? []).map((testCase) => testCase.id);
    if (oldIds.length > 0) {
      const { error: deleteError } = await db.from('test_cases').delete().in('id', oldIds);
      throwDbError(deleteError);
    }
    return data;
  },
});
