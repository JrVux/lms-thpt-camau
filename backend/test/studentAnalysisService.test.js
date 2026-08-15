import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentAnalysisService } from '../src/services/studentAnalysisService.js';

const classRow = { id: 'class-1', teacher_id: 'teacher-1', name: 'Lớp', grade: '10', subject: 'python' };
const enrolledRow = { id: 'enr-1', user_id: 'student-1', class_id: 'class-1' };

const tableDb = (data = {}) => {
  const calls = [];
  const store = {
    classes: [classRow],
    enrollments: [enrolledRow],
    ...data,
  };
  return {
    calls,
    from(table) {
      const rows = store[table] ?? [];
      let pending = null;
      const chain = new Proxy({}, {
        get(_t, method) {
          if (method === 'then') {
            let result = { data: (() => { const r = pending ?? rows[0] ?? null; return r && !r.id ? { ...r, id: 'generated' } : r; })(), error: null };
            if (table === 'student_analysis_jobs' && pending && rows.some((r) => ['queued', 'preparing_evidence', 'analyzing'].includes(r.status))) {
              result = { data: null, error: { code: '23505', message: 'active job exists' } };
            }
            return (resolve) => Promise.resolve(result).then(resolve);
          }
          return (...args) => {
            calls.push({ table, method, args });
            if (['insert', 'update', 'delete'].includes(method)) pending = args[0] ?? null;
            if (['single', 'maybeSingle'].includes(method)) {
              let result = { data: (() => { const r = pending ?? rows[0] ?? null; return r && !r.id ? { ...r, id: 'generated' } : r; })(), error: null };
              if (table === 'student_analysis_jobs' && pending && rows.some((r) => ['queued', 'preparing_evidence', 'analyzing'].includes(r.status))) {
                result = { data: null, error: { code: '23505', message: 'active job exists' } };
              }
              return Promise.resolve(result);
            }
            return chain;
          };
        },
      });
      return chain;
    },
  };
};

const evidenceService = {
  async preview() { return { counts: { submission_count: 2, test_result_count: 4 }, sparse: false }; },
  async buildBundle() { return { bundle: { student_code: 'STUDENT_01', evidence: [{ evidence_id: 'E01' }] }, counts: { submission_count: 2, test_result_count: 4 }, fingerprint: 'fp-1' }; },
};

const approvalReview = { teacher_report: { summary: 's', strengths: [], reinforcement_areas: [], common_errors: [], trend_interpretation: 't', insufficient_evidence: [], priority_goals: [], warnings: '' }, student_report: { doing_well: 'd', practice_more: 'p', two_week_goals: 'g', steps: ['s'] } };

test('createJob delegates ownership and prevents a concurrent active job', async () => {
  const db = tableDb({ student_analysis_jobs: [{ id: 'job-x', class_id: 'class-1', student_id: 'student-1', status: 'queued' }] });
  const service = createStudentAnalysisService({ db, evidenceService });
  await assert.rejects(
    service.createJob({ teacherId: 'teacher-1', classId: 'class-1', studentId: 'student-1', scope: { mode: 'latest', limit: 5 } }),
    (err) => err.code === 'ANALYSIS_ALREADY_RUNNING'
  );
});

test('createJob stores a queued job and returns it', async () => {
  const db = tableDb();
  const service = createStudentAnalysisService({ db, evidenceService });
  const job = await service.createJob({ teacherId: 'teacher-1', classId: 'class-1', studentId: 'student-1', scope: { mode: 'latest', limit: 5 } });
  assert.ok(job && job.id);
  const insert = db.calls.find((c) => c.table === 'student_analysis_jobs' && c.method === 'insert');
  assert.ok(insert, 'insert call must exist');
  assert.equal(insert.args[0].requested_by, 'teacher-1');
});

test('reviewReport stores edited content separately and never mutates ai fields', async () => {
  const db = tableDb({
    student_analysis_jobs: [{ id: 'job-1', class_id: 'class-1', student_id: 'student-1', requested_by: 'teacher-1', status: 'awaiting_review', scope: {} }],
    student_analysis_reports: [{ id: 'report-1', job_id: 'job-1', ai_teacher_report: { summary: 'ai' }, ai_student_report: { doing_well: 'ai' }, schema_version: '1.0', review_status: 'pending' }],
  });
  const service = createStudentAnalysisService({ db, evidenceService });
  await service.reviewReport({ teacherId: 'teacher-1', jobId: 'job-1', reportId: 'report-1', review: { ...approvalReview, decision: 'approved_internal' } });
  const update = db.calls.find((c) => c.table === 'student_analysis_reports' && c.method === 'update');
  assert.equal(update.args[0].edited_teacher_report.summary, 's');
  assert.equal(update.args[0].review_status, 'approved_internal');
  assert.equal(update.args[0].ai_teacher_report, undefined);
});

test('publish requires reviewed content and marks published', async () => {
  const db = tableDb({
    student_analysis_jobs: [{ id: 'job-1', class_id: 'class-1', student_id: 'student-1', requested_by: 'teacher-1', status: 'awaiting_review', scope: {} }],
    student_analysis_reports: [{ id: 'report-1', job_id: 'job-1', ai_teacher_report: { summary: 'ai' }, ai_student_report: { doing_well: 'ai' }, schema_version: '1.0', review_status: 'pending' }],
  });
  const service = createStudentAnalysisService({ db, evidenceService });
  await service.reviewReport({ teacherId: 'teacher-1', jobId: 'job-1', reportId: 'report-1', review: { ...approvalReview, decision: 'published' } });
  const update = db.calls.find((c) => c.table === 'student_analysis_reports' && c.method === 'update');
  assert.equal(update.args[0].review_status, 'published');
  assert.ok(update.args[0].published_at);
});

test('rejected review schedules a retry job via event', async () => {
  const db = tableDb({
    student_analysis_jobs: [{ id: 'job-1', class_id: 'class-1', student_id: 'student-1', requested_by: 'teacher-1', status: 'awaiting_review', scope: {} }],
    student_analysis_reports: [{ id: 'report-1', job_id: 'job-1', ai_teacher_report: {}, ai_student_report: {}, schema_version: '1.0', review_status: 'pending' }],
  });
  const service = createStudentAnalysisService({ db, evidenceService });
  await service.reviewReport({ teacherId: 'teacher-1', jobId: 'job-1', reportId: 'report-1', review: { ...approvalReview, decision: 'rejected', instruction: 'thêm ví dụ' } });
  const event = db.calls.find((c) => c.table === 'student_analysis_events' && c.method === 'insert');
  assert.ok(event);
  assert.equal(event.args[0].event_type, 'rejected');
  const jobInsert = db.calls.filter((c) => c.table === 'student_analysis_jobs' && c.method === 'insert');
  assert.ok(jobInsert.length >= 1);
});

test('listReports returns an array for the owned class', async () => {
  const db = tableDb({ classes: [classRow], student_analysis_jobs: [] });
  const service = createStudentAnalysisService({ db, evidenceService });
  const reports = await service.listReports({ teacherId: 'teacher-1', classId: 'class-1', studentId: 'student-1' });
  assert.ok(Array.isArray(reports));
});
