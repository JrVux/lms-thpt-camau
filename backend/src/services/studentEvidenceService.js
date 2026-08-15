import { createHash } from 'node:crypto';

const REQUIRED_SUBMISSIONS = 2;
const REQUIRED_TEST_RESULTS = 4;

export const normalizeAnalysisScope = (scope = {}) => {
  if (scope.mode === 'dates') {
    const from = String(scope.from ?? '');
    const to = String(scope.to ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      throw Object.assign(new Error('Khoảng ngày không hợp lệ.'), { code: 'INVALID_ANALYSIS_SCOPE' });
    }
    return { mode: 'dates', from, to };
  }
  const limit = Number(scope.limit ?? 5);
  if (![3, 5, 10].includes(limit)) {
    throw Object.assign(new Error('Số bài không hợp lệ.'), { code: 'INVALID_ANALYSIS_SCOPE' });
  }
  return { mode: 'latest', limit };
};

const requireOwnedClass = async (db, classId, teacherId) => {
  const { data, error } = await db.from('classes')
    .select('id,name,grade,subject,teacher_id').eq('id', classId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.teacher_id !== teacherId) throw new Error('Bạn không có quyền truy cập lớp này.');
  return data;
};

const requireEnrollment = async (db, classId, studentId) => {
  const { data, error } = await db.from('enrollments')
    .select('id').eq('class_id', classId).eq('user_id', studentId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Học sinh không thuộc lớp này.');
  return data;
};

const selectSubmissions = async (db, classId, studentId, scope) => {
  let query = db.from('submissions')
    .select('id,user_id,assignment_id,delivery_id,submitted_at,score,max_score,assignment:assignments(id,title,type,description),submission_results(id,test_case_id,test_name,passed,points,actual_output,error_message)')
    .eq('user_id', studentId)
    .order('submitted_at', { ascending: false });
  if (scope.mode === 'dates') {
    query = query.gte('submitted_at', `${scope.from}T00:00:00Z`).lte('submitted_at', `${scope.to}T23:59:59Z`);
  }
  let { data, error } = await query;
  if (error) throw new Error(error.message);
  let rows = data ?? [];
  if (scope.mode === 'latest') rows = rows.slice(0, scope.limit);
  return rows;
};

const toEvidenceRecords = (submissions) => {
  const records = [];
  let index = 1;
  for (const sub of submissions) {
    const assignment = Array.isArray(sub.assignment) ? sub.assignment[0] : sub.assignment;
    const results = sub.submission_results ?? [];
    for (const res of results) {
      records.push({
        evidence_id: `E${String(index).padStart(2, '0')}`,
        assignment_id: sub.assignment_id,
        assignment_title: assignment?.title ?? null,
        assignment_type: assignment?.type ?? null,
        assignment_description: assignment?.description ?? null,
        submitted_at: sub.submitted_at,
        system_score: sub.score ?? null,
        system_max_score: sub.max_score ?? null,
        test_case_id: res.test_case_id,
        test_name: res.test_name,
        passed: Boolean(res.passed),
        actual_output: res.actual_output,
        error_message: res.error_message,
      });
      index += 1;
    }
  }
  return records;
};

const buildFingerprint = (scope, submissions) => {
  const material = JSON.stringify({
    scope,
    ids: submissions.map((s) => ({ s: s.id, r: (s.submission_results ?? []).map((x) => x.id), t: s.submitted_at })),
  });
  return createHash('sha256').update(material).digest('hex');
};

export const createStudentEvidenceService = (db) => ({
  async preview({ teacherId, classId, studentId, scope }) {
    const normalized = normalizeAnalysisScope(scope);
    await requireOwnedClass(db, classId, teacherId);
    await requireEnrollment(db, classId, studentId);
    const submissions = await selectSubmissions(db, classId, studentId, normalized);
    const testResultCount = submissions.reduce((sum, s) => sum + (s.submission_results?.length ?? 0), 0);
    const sparse = submissions.length < REQUIRED_SUBMISSIONS || testResultCount < REQUIRED_TEST_RESULTS;
    return {
      counts: { submission_count: submissions.length, test_result_count: testResultCount },
      sparse,
      submissions: [],
    };
  },

  async buildBundle({ teacherId, classId, studentId, scope, confirmSparseData = false }) {
    const normalized = normalizeAnalysisScope(scope);
    await requireOwnedClass(db, classId, teacherId);
    await requireEnrollment(db, classId, studentId);
    const submissions = await selectSubmissions(db, classId, studentId, normalized);
    const testResultCount = submissions.reduce((sum, s) => sum + (s.submission_results?.length ?? 0), 0);
    if (!confirmSparseData && (submissions.length < REQUIRED_SUBMISSIONS || testResultCount < REQUIRED_TEST_RESULTS)) {
      const err = new Error('Dữ liệu còn thưa, cần xác nhận trước khi phân tích.');
      err.code = 'SPARSE_EVIDENCE_CONFIRMATION_REQUIRED';
      throw err;
    }
    const evidence = toEvidenceRecords(submissions);
    const fingerprint = buildFingerprint(normalized, submissions);
    const bundle = {
      student_code: 'STUDENT_01',
      scope: normalized,
      evidence,
      counts: { submission_count: submissions.length, test_result_count: testResultCount },
    };
    return { bundle, counts: bundle.counts, fingerprint };
  },
});
