import { randomUUID } from 'node:crypto';
import { calculateSkillSnapshot, DEFAULT_MASTERY_CONFIG } from './masteryEngine.js';
import { normalizeMappings, validateCompetencyScope, validateMappings } from './competencyRules.js';

const throwDbError = (error, fallback) => {
  if (error) throw new Error(fallback ?? error.message);
};

export const filterVisibleCompetencies = (rows, teacherId) => (rows ?? [])
  .filter((row) => !row.owner_teacher_id || row.owner_teacher_id === teacherId);

export const buildEvidenceRows = ({ submissions = [], mappings = [] }) => {
  const approved = mappings.filter((mapping) => mapping.status === 'approved');
  const byTest = new Map();
  const byAssignment = new Map();
  for (const mapping of approved) {
    if (!mapping.test_case_id) {
      byAssignment.set(mapping.assignment_id, [
        ...(byAssignment.get(mapping.assignment_id) ?? []),
        mapping,
      ]);
      continue;
    }
    const key = `${mapping.assignment_id}:${mapping.test_case_id}`;
    byTest.set(key, [...(byTest.get(key) ?? []), mapping]);
  }
  const rows = [];
  for (const submission of submissions) {
    for (const result of submission.submission_results ?? []) {
      const testMappings = byTest.get(`${submission.assignment_id}:${result.test_case_id}`) ?? [];
      const assignmentMappings = byAssignment.get(submission.assignment_id) ?? [];
      const matches = [...testMappings, ...assignmentMappings];
      for (const mapping of matches) {
        rows.push({
          student_id: submission.user_id,
          competency_id: mapping.competency_id,
          assignment_id: submission.assignment_id,
          submission_id: submission.id,
          submission_result_id: result.id,
          passed: Boolean(result.passed),
          score_ratio: result.passed ? 1 : 0,
          difficulty: Number(mapping.difficulty),
          weight: Number(mapping.weight),
          occurred_at: submission.submitted_at,
        });
      }
    }
  }
  return rows;
};

const requireOwnedClass = async (db, classId, teacherId) => {
  const { data, error } = await db.from('classes')
    .select('id,name,grade,subject,teacher_id').eq('id', classId).maybeSingle();
  throwDbError(error);
  if (!data || data.teacher_id !== teacherId) throw new Error('Bạn không có quyền truy cập lớp này.');
  return data;
};

const requireOwnedAssignment = async (db, assignmentId, teacherId) => {
  const { data, error } = await db.from('assignments')
    .select('id,teacher_id,type,category,test_cases(id)').eq('id', assignmentId).maybeSingle();
  throwDbError(error);
  if (!data || data.teacher_id !== teacherId) throw new Error('Bạn không có quyền chỉnh sửa bài tập này.');
  return data;
};

const requireEnrollment = async (db, classId, studentId) => {
  const { data, error } = await db.from('enrollments')
    .select('id').eq('class_id', classId).eq('user_id', studentId).maybeSingle();
  throwDbError(error);
  if (!data) throw new Error('Học sinh không thuộc lớp này.');
};

const groupByStudentSkill = (rows) => {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.student_id}:${row.competency_id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
};

export const createCompetencyService = (db) => ({
  async listFramework({ teacherId, grade, subject }) {
    const { data, error } = await db.from('competencies')
      .select('*').eq('is_active', true).eq('grade', grade).eq('subject', subject).order('code');
    throwDbError(error, 'Không thể tải khung năng lực.');
    return filterVisibleCompetencies(data, teacherId);
  },

  async createCustomCompetency({ teacherId, input }) {
    validateCompetencyScope({
      competency: { ...input, is_active: true, owner_teacher_id: teacherId },
      teacherId,
      subject: 'python',
      grade: '10',
    });
    const { data: framework, error: frameworkError } = await db.from('competency_framework_versions')
      .select('id').eq('status', 'active').order('version', { ascending: false }).limit(1).maybeSingle();
    throwDbError(frameworkError, 'Không thể xác định phiên bản khung năng lực.');
    if (!framework) throw new Error('Chưa có khung năng lực đang hoạt động.');
    const payload = {
      framework_version_id: framework.id,
      code: `CUSTOM.${randomUUID()}`,
      name: input.name.trim(),
      description: input.description.trim(),
      subject: input.subject,
      grade: input.grade,
      parent_id: input.parent_id || null,
      prerequisite_ids: input.prerequisite_ids ?? [],
      owner_teacher_id: teacherId,
      is_active: true,
    };
    const { data, error } = await db.from('competencies').insert(payload).select().single();
    throwDbError(error, 'Không thể tạo kỹ năng riêng.');
    return data;
  },

  async updateCustomCompetency({ teacherId, competencyId, input }) {
    const { data: current, error: readError } = await db.from('competencies')
      .select('*').eq('id', competencyId).maybeSingle();
    throwDbError(readError);
    if (!current || current.owner_teacher_id !== teacherId) {
      throw new Error('Bạn không có quyền chỉnh sửa kỹ năng này.');
    }
    const next = { ...current, ...input };
    validateCompetencyScope({ competency: next, teacherId, subject: 'python', grade: '10' });
    const allowed = ['name', 'description', 'subject', 'grade', 'parent_id', 'prerequisite_ids', 'is_active'];
    const patch = Object.fromEntries(allowed.filter((key) => key in input).map((key) => [key, input[key]]));
    const { data, error } = await db.from('competencies')
      .update(patch).eq('id', competencyId).eq('owner_teacher_id', teacherId).select().single();
    throwDbError(error, 'Không thể cập nhật kỹ năng riêng.');
    return data;
  },

  async getAssignmentMappings({ teacherId, assignmentId }) {
    await requireOwnedAssignment(db, assignmentId, teacherId);
    const { data, error } = await db.from('assignment_competency_mappings')
      .select('*, competency:competencies(*)').eq('assignment_id', assignmentId).order('created_at');
    throwDbError(error, 'Không thể tải kỹ năng của bài tập.');
    return data ?? [];
  },

  async replaceAssignmentMappings({ teacherId, assignmentId, mappings }) {
    const assignment = await requireOwnedAssignment(db, assignmentId, teacherId);
    const normalized = normalizeMappings(mappings).map((row) => ({ ...row, assignment_id: assignmentId }));
    const competencyIds = [...new Set(normalized.map((row) => row.competency_id))];
    let competencies = [];
    if (competencyIds.length) {
      const { data, error } = await db.from('competencies').select('*').in('id', competencyIds);
      throwDbError(error, 'Không thể kiểm tra kỹ năng.');
      competencies = data ?? [];
    }
    validateMappings({ mappings: normalized, assignment, competencies, teacherId });
    const { error: deleteError } = await db.from('assignment_competency_mappings')
      .delete().eq('assignment_id', assignmentId);
    throwDbError(deleteError, 'Không thể thay thế kỹ năng của bài tập.');
    if (!normalized.length) return [];
    const now = new Date().toISOString();
    const payload = normalized.map((mapping) => ({
      ...mapping,
      proposed_by: 'teacher',
      reviewed_by: mapping.status === 'approved' ? teacherId : null,
      reviewed_at: mapping.status === 'approved' ? now : null,
    }));
    const { data, error } = await db.from('assignment_competency_mappings').insert(payload).select();
    throwDbError(error, 'Không thể lưu kỹ năng của bài tập.');
    return data ?? [];
  },

  async calculateClassSnapshots({ teacherId, classId, now = new Date().toISOString() }) {
    await requireOwnedClass(db, classId, teacherId);
    const [{ data: enrollments, error: enrollmentError }, { data: deliveries, error: deliveryError }] = await Promise.all([
      db.from('enrollments').select('user_id').eq('class_id', classId),
      db.from('assignment_deliveries').select('id,assignment_id').eq('class_id', classId),
    ]);
    throwDbError(enrollmentError);
    throwDbError(deliveryError);
    const studentIds = (enrollments ?? []).map((row) => row.user_id);
    const deliveryIds = (deliveries ?? []).map((row) => row.id);
    const assignmentIds = (deliveries ?? []).map((row) => row.assignment_id);
    if (!studentIds.length || !deliveryIds.length) {
      return { calculated_at: now, student_count: studentIds.length, skill_count: 0, snapshot_count: 0 };
    }
    const [{ data: submissions, error: submissionError }, { data: mappings, error: mappingError }, { data: activeConfig, error: configError }] = await Promise.all([
      db.from('submissions').select('id,user_id,assignment_id,submitted_at,submission_results(id,test_case_id,passed)').in('delivery_id', deliveryIds).in('user_id', studentIds),
      db.from('assignment_competency_mappings').select('*').in('assignment_id', assignmentIds).eq('status', 'approved'),
      db.from('mastery_config_versions').select('id,version,config').eq('status', 'active').order('version', { ascending: false }).limit(1).maybeSingle(),
    ]);
    throwDbError(submissionError);
    throwDbError(mappingError);
    throwDbError(configError);
    if (!activeConfig) throw new Error('Chưa có cấu hình tính năng lực đang hoạt động.');
    const evidence = buildEvidenceRows({ submissions, mappings });
    if (evidence.length) {
      const { error } = await db.from('competency_evidence').upsert(evidence, { onConflict: 'submission_result_id,competency_id' });
      throwDbError(error, 'Không thể lưu bằng chứng năng lực.');
    }
    const groups = groupByStudentSkill(evidence);
    const snapshots = [...groups.entries()].map(([key, rows]) => {
      const [studentId, competencyId] = key.split(':');
      return {
        student_id: studentId,
        competency_id: competencyId,
        class_id: classId,
        mastery_config_version_id: activeConfig.id,
        ...calculateSkillSnapshot(rows, { ...DEFAULT_MASTERY_CONFIG, ...activeConfig.config, version: activeConfig.version, now }),
        calculated_at: now,
      };
    });
    if (snapshots.length) {
      const { error } = await db.from('student_competency_snapshots').upsert(snapshots, {
        onConflict: 'student_id,competency_id,class_id,mastery_config_version_id',
      });
      throwDbError(error, 'Không thể lưu hồ sơ năng lực.');
    }
    return {
      calculated_at: now,
      student_count: studentIds.length,
      skill_count: new Set(evidence.map((row) => row.competency_id)).size,
      snapshot_count: snapshots.length,
    };
  },

  async getClassDashboard({ teacherId, classId }) {
    const classData = await requireOwnedClass(db, classId, teacherId);
    const [{ data: enrollments, error: enrollmentError }, { data: snapshots, error: snapshotError }] = await Promise.all([
      db.from('enrollments').select('user_id,users(id,full_name)').eq('class_id', classId),
      db.from('student_competency_snapshots').select('*,competency:competencies(id,code,name)').eq('class_id', classId).order('calculated_at', { ascending: false }),
    ]);
    throwDbError(enrollmentError);
    throwDbError(snapshotError);
    const students = (enrollments ?? []).map((row) => ({
      id: row.user_id,
      full_name: row.users?.full_name ?? '',
      skills: (snapshots ?? []).filter((item) => item.student_id === row.user_id),
    }));
    const latest = (snapshots ?? [])[0]?.calculated_at ?? null;
    return { class: classData, calculated_at: latest, snapshots: snapshots ?? [], students };
  },

  async getStudentProfile({ teacherId, classId, studentId }) {
    await requireOwnedClass(db, classId, teacherId);
    await requireEnrollment(db, classId, studentId);
    const [{ data: student, error: studentError }, { data: snapshots, error: snapshotError }, { data: evidence, error: evidenceError }] = await Promise.all([
      db.from('users').select('id,full_name,username').eq('id', studentId).maybeSingle(),
      db.from('student_competency_snapshots').select('*,competency:competencies(id,code,name)').eq('class_id', classId).eq('student_id', studentId),
      db.from('competency_evidence').select('*,competency:competencies(id,code,name),assignment:assignments(id,title),result:submission_results(id,test_name)').eq('student_id', studentId).order('occurred_at', { ascending: false }),
    ]);
    throwDbError(studentError);
    throwDbError(snapshotError);
    throwDbError(evidenceError);
    return { student, skills: snapshots ?? [], evidence: evidence ?? [] };
  },
});
