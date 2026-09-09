const badRequest = (message) => {
  const error = new Error(message);
  error.code = 'BAD_REQUEST';
  throw error;
};

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

export const toStudentEssaySubmission = (submission, report, modelAnswer) => {
  if (!submission) return null;
  const { score: _score, feedback: _feedback, graded_at: _gradedAt, graded_by: _gradedBy, ...safe } = submission;
  const published = report?.published_at
    ? {
        score: Number(report.reviewed_score),
        feedback: report.reviewed_feedback || '',
        criteria_results: report.reviewed_criteria_results || [],
        strengths: report.ai_strengths || [],
        improvements: report.ai_improvements || [],
        published_at: report.published_at,
        ...(report.show_model_answer && modelAnswer ? { model_answer: modelAnswer } : {}),
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
    const { data, error } = await db.from('essay_grading_reports').select('*').in('submission_id', submissionIds).not('published_at', 'is', null).order('published_at', { ascending: false });
    if (error) throw new Error(error.message);
    const result = new Map();
    for (const report of data || []) if (!result.has(report.submission_id)) result.set(report.submission_id, report);
    return result;
  };

  const teacherReport = async ({ teacherId, submissionId }) => {
    const { data: submission, error } = await db.from('submissions').select('*, assignment_deliveries!inner(teacher_id)').eq('id', submissionId).maybeSingle();
    if (error || !submission) return badRequest('Không tìm thấy bài nộp.');
    if (submission.assignment_deliveries?.teacher_id !== teacherId) {
      const forbidden = new Error('Bạn không có quyền xem kết quả chấm này.');
      forbidden.code = 'FORBIDDEN';
      throw forbidden;
    }
    const { data: job } = await db.from('essay_grading_jobs').select('*').eq('submission_id', submissionId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    let report = null;
    if (job) ({ data: report } = await db.from('essay_grading_reports').select('*').eq('job_id', job.id).maybeSingle());
    return { submission, job, report };
  };

  const saveReview = async ({ teacherId, submissionId, criteriaResults, feedback, approved = false, showModelAnswer = false }) => {
    const context = await teacherReport({ teacherId, submissionId });
    if (!context.report || !context.job) return badRequest('Bài nộp chưa có bản chấm AI để duyệt.');
    const score = reviewedScore(criteriaResults, context.job.rubric_snapshot, context.submission.max_score || context.job.rubric_snapshot.reduce((n, item) => n + Number(item.max_points), 0));
    const now = new Date().toISOString();
    const { data, error } = await db.from('essay_grading_reports').update({ reviewed_score: score, reviewed_criteria_results: criteriaResults, reviewed_feedback: feedback || '', review_status: approved ? 'approved' : 'pending', reviewed_by: teacherId, reviewed_at: now, show_model_answer: Boolean(showModelAnswer), updated_at: now }).eq('id', context.report.id).select().maybeSingle();
    if (error) throw new Error(error.message);
    await db.from('submissions').update({ score, feedback: feedback || '', graded_at: now, graded_by: teacherId }).eq('id', submissionId);
    await db.from('essay_grading_events').insert({ job_id: context.job.id, report_id: context.report.id, event_type: approved ? 'review_approved' : 'review_saved', actor_id: teacherId, metadata: {} });
    return data;
  };

  const setPublished = async ({ teacherId, submissionIds, published }) => {
    const results = [];
    for (const submissionId of submissionIds || []) {
      const context = await teacherReport({ teacherId, submissionId });
      if (!context.report || (published && context.report.review_status !== 'approved')) {
        results.push({ submission_id: submissionId, reason: 'not_approved' });
        continue;
      }
      const now = new Date().toISOString();
      const patch = published
        ? { published_at: now, published_by: teacherId, unpublished_at: null, unpublished_by: null, updated_at: now }
        : { published_at: null, published_by: null, unpublished_at: now, unpublished_by: teacherId, updated_at: now };
      const { error } = await db.from('essay_grading_reports').update(patch).eq('id', context.report.id);
      if (error) throw new Error(error.message);
      await db.from('essay_grading_events').insert({ job_id: context.job.id, report_id: context.report.id, event_type: published ? 'published' : 'unpublished', actor_id: teacherId, metadata: {} });
      results.push({ submission_id: submissionId, published });
    }
    return results;
  };

  const retry = async ({ teacherId, submissionId }) => {
    const context = await teacherReport({ teacherId, submissionId });
    const { data: assignment } = await db.from('assignments').select('*').eq('id', context.job?.assignment_id || context.submission.assignment_id).maybeSingle();
    return enqueue({ submission: context.submission, assignment, studentId: context.submission.user_id, requestedBy: teacherId });
  };

  return { enqueue, publishedReportsBySubmission, teacherReport, saveReview, setPublished, retry };
};
