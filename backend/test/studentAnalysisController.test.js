import test from 'node:test';
import assert from 'node:assert/strict';
import * as studentAnalysisControllerModule from '../src/controllers/studentAnalysisController.js';

const { createStudentAnalysisController } = studentAnalysisControllerModule;

const makeService = (impl) => ({ ...impl });

const makeReqRes = (params = {}, body = {}, user = { id: 'teacher-1' }) => {
  const req = { params, body, user };
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
  const next = (err) => { throw err; };
  return { req, res, next };
};

test('exports route handlers used by the student-analysis router', () => {
  for (const handler of ['preview', 'createJob', 'getJob', 'listReports', 'getReport', 'reviewReport', 'retryJob']) {
    assert.equal(typeof studentAnalysisControllerModule[handler], 'function');
  }
});

test('preview passes teacherId and scope to service', async () => {
  const calls = [];
  const service = makeService({
    async preview(args) { calls.push(args); return { counts: { submission_count: 2, test_result_count: 4 }, sparse: false }; },
  });
  const controller = createStudentAnalysisController(service);
  const { req, res, next } = makeReqRes({ classId: 'c1', studentId: 's1' }, { scope: { mode: 'latest', limit: 5 } });
  await controller.preview(req, res, next);
  assert.equal(calls[0].teacherId, 'teacher-1');
  assert.equal(calls[0].classId, 'c1');
  assert.equal(calls[0].studentId, 's1');
  assert.deepEqual(calls[0].scope, { mode: 'latest', limit: 5 });
  assert.equal(res.body.counts.submission_count, 2);
});

test('createJob delegates to service and returns 202', async () => {
  const service = makeService({
    async createJob(args) { return { id: 'job-1', status: 'queued' }; },
  });
  const controller = createStudentAnalysisController(service);
  const { req, res, next } = makeReqRes({ classId: 'c1', studentId: 's1' }, { scope: { mode: 'latest', limit: 5 } });
  await controller.createJob(req, res, next);
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.id, 'job-1');
});

test('getJob returns job from service', async () => {
  const service = makeService({ async getJob(args) { return { id: 'job-1', status: 'queued' }; } });
  const controller = createStudentAnalysisController(service);
  const { req, res, next } = makeReqRes({ classId: 'c1', studentId: 's1', jobId: 'job-1' });
  await controller.getJob(req, res, next);
  assert.equal(res.body.id, 'job-1');
});

test('listReports passes correct params', async () => {
  const calls = [];
  const service = makeService({ async listReports(args) { calls.push(args); return []; } });
  const controller = createStudentAnalysisController(service);
  const { req, res, next } = makeReqRes({ classId: 'c1', studentId: 's1' });
  await controller.listReports(req, res, next);
  assert.equal(calls[0].teacherId, 'teacher-1');
  assert.equal(calls[0].classId, 'c1');
  assert.equal(calls[0].studentId, 's1');
});

test('getReport returns report', async () => {
  const service = makeService({ async getReport(args) { return { id: 'r1', review_status: 'pending' }; } });
  const controller = createStudentAnalysisController(service);
  const { req, res, next } = makeReqRes({ classId: 'c1', studentId: 's1', jobId: 'job-1', reportId: 'r1' });
  await controller.getReport(req, res, next);
  assert.equal(res.body.id, 'r1');
});

test('reviewReport calls service with review input', async () => {
  const calls = [];
  const service = makeService({ async reviewReport(args) { calls.push(args); return { id: 'r1', review_status: 'approved_internal' }; } });
  const controller = createStudentAnalysisController(service);
  const { req, res, next } = makeReqRes({ classId: 'c1', studentId: 's1', jobId: 'job-1', reportId: 'r1' }, { decision: 'approved_internal', teacher_report: {}, student_report: {} });
  await controller.reviewReport(req, res, next);
  assert.equal(calls[0].teacherId, 'teacher-1');
  assert.equal(calls[0].review.decision, 'approved_internal');
});

test('publishReview sets decision to published', async () => {
  const calls = [];
  const service = makeService({ async reviewReport(args) { calls.push(args); return { id: 'r1', review_status: 'published' }; } });
  const controller = createStudentAnalysisController(service);
  const { req, res, next } = makeReqRes({ classId: 'c1', studentId: 's1', jobId: 'job-1', reportId: 'r1' }, { decision: 'published', teacher_report: {}, student_report: {} });
  await controller.reviewReport(req, res, next);
  assert.equal(calls[0].review.decision, 'published');
});

test('retryJob calls service', async () => {
  const service = makeService({ async retryJob(args) { return { id: 'job-2' }; } });
  const controller = createStudentAnalysisController(service);
  const { req, res, next } = makeReqRes({ classId: 'c1', studentId: 's1', jobId: 'job-1' });
  await controller.retryJob(req, res, next);
  assert.equal(res.body.id, 'job-2');
});

test('service errors are passed to next', async () => {
  const service = makeService({ async preview() { throw new Error('svc err'); } });
  const controller = createStudentAnalysisController(service);
  const { req, res, next } = makeReqRes({ classId: 'c1', studentId: 's1' }, { scope: { mode: 'latest', limit: 5 } });
  await controller.preview(req, res, (err) => { assert.ok(err); });
});
