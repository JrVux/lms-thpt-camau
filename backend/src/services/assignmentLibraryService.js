import { normalizeFileAssignment } from './fileAssignmentRules.js';

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
  'topic_id',
  'starter_code',
  'solution_code',
  'setup_sql',
  'test_code',
  'max_score',
  'submission_type',
  'essay_content',
  'allowed_mime_types',
  'max_file_size_mb',
  'allow_late_submission',
]);

const throwDbError = (error) => {
  if (error) throw new Error(error.message);
};

const throwConflict = (error) => {
  if (error?.code === '23505') {
    const conflict = new Error('Chủ đề này đã tồn tại trong khối.');
    conflict.code = 'CONFLICT';
    throw conflict;
  }
  throwDbError(error);
};

const notFound = (message) => {
  const error = new Error(message);
  error.code = 'NOT_FOUND';
  throw error;
};

const throwMissingRow = (error, message) => {
  if (error?.code === 'PGRST116') notFound(message);
  throwDbError(error);
};

const normalizePayload = (input) => {
  const payload = Object.fromEntries(
    Object.entries(input).filter(([field]) => WRITABLE_FIELDS.has(field))
  );
  if ('topic_id' in payload && (payload.topic_id === '' || payload.topic_id === null)) {
    payload.topic_id = null;
  }
  const fileSettings = normalizeFileAssignment(input);
  return {
    ...payload,
    ...fileSettings,
  };
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
  async list({ teacherId, category, topicId }) {
    let query = db
      .from('assignments')
      .select('*, assignment_topics(name), assignment_deliveries!assignment_deliveries_library_assignment_id_fkey(count)')
      .eq('teacher_id', teacherId)
      .eq('is_library', true)
      .order('updated_at', { ascending: false });
    if (category) query = query.eq('category', category);
    if (topicId) query = query.eq('topic_id', topicId);
    const { data, error } = await query;
    throwDbError(error);
    return (data ?? []).map(({ assignment_deliveries: deliveryCounts, assignment_topics: topic, ...assignment }) => ({
      ...assignment,
      topic: topic?.name ?? null,
      delivery_count: deliveryCounts?.[0]?.count ?? 0,
    }));
  },

  async create({ teacherId, input }) {
    const payload = normalizePayload(input);
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
    const payload = normalizePayload(input);
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

  async listTopics({ teacherId, category }) {
    let query = db
      .from('assignment_topics')
      .select('*, assignments(count)')
      .eq('teacher_id', teacherId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    throwDbError(error);
    return (data ?? []).map(({ assignments: counts, ...topic }) => ({
      ...topic,
      assignment_count: counts?.[0]?.count ?? 0,
    }));
  },

  async createTopic({ teacherId, category, name }) {
    const { data: last, error: lastError } = await db
      .from('assignment_topics')
      .select('sort_order')
      .eq('teacher_id', teacherId)
      .eq('category', category)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    throwDbError(lastError);

    const { data, error } = await db
      .from('assignment_topics')
      .insert([{
        teacher_id: teacherId,
        category,
        name,
        sort_order: (last?.sort_order ?? -1) + 1,
      }])
      .select()
      .single();
    throwConflict(error);
    return data;
  },

  async renameTopic({ teacherId, topicId, name }) {
    const { data, error } = await db
      .from('assignment_topics')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', topicId)
      .eq('teacher_id', teacherId)
      .select()
      .single();
    throwMissingRow(error, 'Không tìm thấy chủ đề.');
    throwConflict(error);
    if (!data) notFound('Không tìm thấy chủ đề.');
    return data;
  },

  async deleteTopic({ teacherId, topicId }) {
    const { data, error } = await db
      .from('assignment_topics')
      .delete()
      .eq('id', topicId)
      .eq('teacher_id', teacherId)
      .select()
      .single();
    throwMissingRow(error, 'Không tìm thấy chủ đề.');
    if (!data) notFound('Không tìm thấy chủ đề.');
    return data;
  },

  async deleteAssignment({ teacherId, assignmentId, libraryOnly = true }) {
    const { data, error } = await db.rpc('delete_assignment_owned', {
      p_assignment_id: assignmentId,
      p_teacher_id: teacherId,
      p_library_only: libraryOnly,
    });
    throwDbError(error);
    const status = data?.status;
    if (status === 'not_found') notFound('Không tìm thấy bài tập.');
    if (status === 'forbidden') {
      const forbidden = new Error('Bạn không phải giáo viên của bài tập này.');
      forbidden.code = 'FORBIDDEN';
      throw forbidden;
    }
    if (status !== 'deleted') {
      const failed = new Error('Không thể xóa bài tập.');
      failed.code = 'DELETE_FAILED';
      throw failed;
    }
    return data;
  },
});
