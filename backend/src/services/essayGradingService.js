const badRequest = (message) => {
  const error = new Error(message);
  error.code = 'BAD_REQUEST';
  throw error;
};

const singleRelation = (value) => Array.isArray(value) ? value[0] ?? null : value ?? null;

export const reviewedScore = (criteriaResults, rubric, maxScore) => {
  const expected = new Map((rubric || []).map((item) => [item.id, Number(item.max_points)]));
  if (!expected.size || !Array.isArray(criteriaResults) || criteriaResults.length !== expected.size) {
    return badRequest('Kết quả duyệt phải có đủ từng tiêu chí trong thang điểm.');
  }
  const seen = new Set();
  let total = 0;
  for (const result of criteriaResults) {
    const id = result?.rubric_item_id;
    const points = Number(result?.awarded_points);
    if (!expected.has(id) || seen.has(id) || !Number.isFinite(points) || points < 0 || points > expected.get(id)) {
      return badRequest('Điểm tiêu chí không hợp lệ hoặc vượt điểm tối đa.');
    }
    seen.add(id);
    total += points;
  }
  if (total > Number(maxScore)) return badRequest('Tổng điểm vượt điểm tối đa của bài.');
  return Number(total.toFixed(2));
};

export const toStudentEssaySubmission = (submission, report, modelAnswer, rubric = []) => {
  if (!submission) return null;
  const { object_key: _objectKey, score: _score, feedback: _feedback, graded_at: _gradedAt, graded_by: _gradedBy, ...safe } = submission;
  const jobSnapshot = Array.isArray(report?.essay_grading_jobs) ? report.essay_grading_jobs[0] : report?.essay_grading_jobs;
  const resultRubric = jobSnapshot?.rubric_snapshot || rubric;
  const resultModelAnswer = jobSnapshot?.model_answer_snapshot || modelAnswer;
  const published = report?.published_at
    ? {
        score: Number(report.reviewed_score),
        feedback: report.reviewed_feedback || '',
        criteria_results: (report.reviewed_criteria_results || []).map((result) => {
          const criterion = resultRubric.find((item) => item.id === result.rubric_item_id);
          return { ...result, title: criterion?.title || result.rubric_item_id, max_points: criterion?.max_points };
        }),
        strengths: report.ai_strengths || [],
        improvements: report.ai_improvements || [],
        published_at: report.published_at,
        ...(report.show_model_answer && resultModelAnswer ? { model_answer: resultModelAnswer } : {}),
      }
    : null;
  return {
    ...safe,
    grading_status: published ? 'published' : (report ? 'under_review' : 'processing'),
    published_result: published,
  };
};

export const buildPublishResult = (reports) => (reports || []).reduce((result, report) => {
  if (report.review_status === 'approved') result.publishable.push(report.submission_id);
  else result.skipped.push({ submission_id: report.submission_id, reason: 'not_approved' });
  return result;
}, { publishable: [], skipped: [] });

export const createEssayGradingService = (db) => {
  const enqueue = async ({ submission, assignment, studentId, requestedBy = null }) => {
    const normalized = Array.isArray(submission) ? submission[0] : submission;
    if (!assignment?.ai_grading_enabled || !normalized?.id) return null;
    const payload = {
      submission_id: normalized.id,
      assignment_id: assignment.id,
      delivery_id: normalized.delivery_id,
      student_id: studentId || normalized.user_id,
      requested_by: requestedBy,
      assignment_content_version: Number(assignment.content_version || 1),
      prompt_version: 'essay-grading-v1',
      model_answer_snapshot: assignment.essay_model_answer,
      rubric_snapshot: assignment.essay_rubric,
      status: 'queued',
    };
    const { data, error } = await db.from('essay_grading_jobs').insert(payload).select().maybeSingle();
    if (error) throw new Error(error.message);
    await db.from('essay_grading_events').insert({ job_id: data.id, event_type: 'queued', actor_id: requestedBy, metadata: {} });
    return data;
  };

  const publishedReportsBySubmission = async (submissionIds) => {
    if (!submissionIds?.length) return new Map();
    const { data, error } = await db.from('essay_grading_reports').select('*, essay_grading_jobs(model_answer_snapshot,rubric_snapshot)').in('submission_id', submissionIds).not('published_at', 'is', null).order('published_at', { ascending: false });
    if (error) throw new Error(error.message);
    const result = new Map();
    for (const report of data || []) if (!result.has(report.submission_id)) result.set(report.submission_id, report);
    return result;
  };

  const teacherReport = async ({ teacherId, submissionId }) => {
    const { data: submission, error } = await db.from('submissions').select('*, assignment_deliveries!inner(teacher_id,assignment_id,library_assignment_id)').eq('id', submissionId).maybeSingle();
    if (error || !submission) return badRequest('Không tìm thấy bài nộp.');
    const delivery = singleRelation(submission.assignment_deliveries);
    if (delivery?.teacher_id !== teacherId) {
      const forbidden = new Error('Bạn không có quyền xem kết quả chấm này.');
      forbidden.code = 'FORBIDDEN';
      throw forbidden;
    }
    submission.assignment_deliveries = delivery;
    const { data: job } = await db.from('essay_grading_jobs').select('*').eq('submission_id', submissionId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    let report = null;
    if (job) ({ data: report } = await db.from('essay_grading_reports').select('*').eq('job_id', job.id).maybeSingle());
    return { submission, job, report };
  };

  const saveReview = async ({ teacherId, submissionId, criteriaResults, feedback, approved = false, rejected = false, showModelAnswer = false }) => {
    if (feedback !== undefined && (typeof feedback !== 'string' || feedback.length > 10000)) return badRequest('Nhận xét giáo viên không hợp lệ.');
    const context = await teacherReport({ teacherId, submissionId });
    if (!context.job) return badRequest('Bài nộp chưa có lượt chấm để duyệt.');
    if (!context.report) {
      const { data: manualReport, error: insertError } = await db.from('essay_grading_reports').insert({
        job_id: context.job.id,
        submission_id: submissionId,
        source: 'manual',
        review_status: 'pending',
        show_model_answer: Boolean(showModelAnswer),
      }).select().maybeSingle();
      if (insertError) throw new Error(insertError.message);
      context.report = manualReport;
    }
    const score = reviewedScore(criteriaResults, context.job.rubric_snapshot, context.submission.max_score || context.job.rubric_snapshot.reduce((n, item) => n + Number(item.max_points), 0));
    const now = new Date().toISOString();
    const reviewStatus = rejected ? 'rejected' : approved ? 'approved' : 'pending';
    const { data, error } = await db.from('essay_grading_reports').update({ reviewed_score: score, reviewed_criteria_results: criteriaResults, reviewed_feedback: feedback || '', review_status: reviewStatus, reviewed_by: teacherId, reviewed_at: now, show_model_answer: Boolean(showModelAnswer), updated_at: now }).eq('id', context.report.id).select().maybeSingle();
    if (error) throw new Error(error.message);
    await db.from('essay_grading_events').insert({ job_id: context.job.id, report_id: context.report.id, event_type: rejected ? 'review_rejected' : approved ? 'review_approved' : 'review_saved', actor_id: teacherId, metadata: { show_model_answer: Boolean(showModelAnswer), source: context.report.source } });
    return data;
  };

  const setPublished = async ({ teacherId, assignmentId, submissionIds, published, showModelAnswer }) => {
    const uniqueIds = [...new Set(submissionIds || [])];
    if (uniqueIds.length > 500) return badRequest('Mỗi lần chỉ được cập nhật tối đa 500 bài nộp.');
    const results = [];
    for (const submissionId of uniqueIds) {
      const context = await teacherReport({ teacherId, submissionId });
      if (!context.job || context.job.assignment_id !== assignmentId) {
        results.push({ submission_id: submissionId, reason: 'wrong_assignment' });
        continue;
      }
      if (!context.report || (published && context.report.review_status !== 'approved')) {
        results.push({ submission_id: submissionId, reason: 'not_approved' });
        continue;
      }
      const now = new Date().toISOString();
      const patch = published
        ? { published_at: now, published_by: teacherId, unpublished_at: null, unpublished_by: null, updated_at: now }
        : { published_at: null, published_by: null, unpublished_at: now, unpublished_by: teacherId, updated_at: now };
      if (typeof showModelAnswer === 'boolean') patch.show_model_answer = showModelAnswer;
      const { error } = await db.from('essay_grading_reports').update(patch).eq('id', context.report.id);
      if (error) throw new Error(error.message);
      await db.from('essay_grading_events').insert({ job_id: context.job.id, report_id: context.report.id, event_type: published ? 'published' : 'unpublished', actor_id: teacherId, metadata: { show_model_answer: typeof showModelAnswer === 'boolean' ? showModelAnswer : context.report.show_model_answer } });
      results.push({ submission_id: submissionId, published });
    }
    return results;
  };

  const retry = async ({ teacherId, submissionId }) => {
    const context = await teacherReport({ teacherId, submissionId });
    if (context.report?.published_at || context.report?.review_status === 'approved') return badRequest('Không thể chấm lại kết quả đã duyệt hoặc đã công bố.');
    if (context.job && !['failed', 'awaiting_review'].includes(context.job.status)) {
      const conflict = new Error('Bài nộp đang được AI xử lý.');
      conflict.code = 'CONFLICT';
      throw conflict;
    }
    const delivery = singleRelation(context.submission.assignment_deliveries);
    const assignmentId = context.job?.assignment_id || context.submission.assignment_id || delivery?.library_assignment_id || delivery?.assignment_id;
    const { data: assignment } = await db.from('assignments').select('*').eq('id', assignmentId).maybeSingle();
    if (!assignment) return badRequest('Không tìm thấy cấu hình bài tự luận.');
    const prepared = { ...context.submission, assignment_id: assignment.id };
    if (!context.submission.assignment_id) {
      const { error: prepareError } = await db.from('submissions').update({ assignment_id: assignment.id, max_score: assignment.max_score }).eq('id', submissionId);
      if (prepareError) throw new Error(prepareError.message);
    }
    const job = await enqueue({ submission: prepared, assignment, studentId: context.submission.user_id, requestedBy: teacherId });
    if (job) await db.from('essay_grading_events').insert({ job_id: job.id, event_type: 'retry_requested', actor_id: teacherId, metadata: { previous_job_id: context.job?.id || null } });
    return job;
  };

  const createManualReview = async ({ teacherId, submission, assignment, score, feedback }) => {
    const maxScore = Number(assignment.max_score || submission.max_score || 10);
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > maxScore) return badRequest('Điểm tự luận không hợp lệ.');
    const rubric = [{ id: 'manual-total', title: 'Đánh giá tổng thể', description: 'Giáo viên chấm thủ công', max_points: maxScore, acceptance_notes: '' }];
    const { data: job, error: jobError } = await db.from('essay_grading_jobs').insert({
      submission_id: submission.id, assignment_id: assignment.id, delivery_id: submission.delivery_id,
      student_id: submission.user_id, requested_by: teacherId,
      assignment_content_version: Number(assignment.content_version || 1), prompt_version: 'manual-review-v1',
      model_answer_snapshot: assignment.essay_model_answer || '', rubric_snapshot: rubric,
      status: 'awaiting_review', completed_at: new Date().toISOString(),
    }).select().maybeSingle();
    if (jobError) throw new Error(jobError.message);
    const now = new Date().toISOString();
    const criteria = [{ rubric_item_id: 'manual-total', awarded_points: numericScore, status: 'met', explanation: feedback || 'Giáo viên chấm thủ công.', evidence_snippets: [], confidence: 1 }];
    const { data: report, error: reportError } = await db.from('essay_grading_reports').insert({
      job_id: job.id, submission_id: submission.id, source: 'manual', reviewed_score: numericScore,
      reviewed_criteria_results: criteria, reviewed_feedback: feedback || '', review_status: 'approved',
      reviewed_by: teacherId, reviewed_at: now, show_model_answer: false,
    }).select().maybeSingle();
    if (reportError) throw new Error(reportError.message);
    await db.from('essay_grading_events').insert({ job_id: job.id, report_id: report.id, event_type: 'manual_review_approved', actor_id: teacherId, metadata: {} });
    return report;
  };

  return { enqueue, publishedReportsBySubmission, teacherReport, saveReview, setPublished, retry, createManualReview };
};
