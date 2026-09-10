const SAFE_CODES = new Set(['AI_TIMEOUT', 'AI_PROVIDER_ERROR', 'AI_CONFIGURATION_ERROR', 'AI_ESSAY_INVALID', 'FILE_NOT_AVAILABLE', 'FILE_INVALID', 'FILE_TOO_LARGE']);
const RETRYABLE = new Set(['AI_TIMEOUT', 'AI_PROVIDER_ERROR', 'FILE_NOT_AVAILABLE']);
const backoffMs = (attempt) => Math.min(60_000 * (2 ** Math.max(0, attempt - 1)), 900_000);

export const safeEssayErrorCode = (error) => SAFE_CODES.has(error?.code) ? error.code : 'AI_ESSAY_FAILED';

export const processEssayJob = async ({ job, assignment, submission, fileReader, gateway }) => {
  const input = await fileReader.read({ submission, assignment });
  const gradingMethod = job.grading_method || 'rubric_v1';
  const generated = await gateway.generate({
    gradingMethod,
    question: assignment.essay_content,
    modelAnswer: job.model_answer_snapshot,
    rubric: job.rubric_snapshot,
    maxScore: assignment.max_score,
    extractedText: input.extractedText,
    file: input.file,
  });
  const report = {
    job_id: job.id, submission_id: job.submission_id, source: 'ai', grading_method: gradingMethod,
    extracted_text: generated.grade.extracted_text || input.extractedText || '',
    extraction_method: input.extractionMethod,
    extraction_quality: generated.grade.extraction_quality,
    extraction_warnings: generated.grade.extraction_warnings || [],
    ai_score: generated.grade.score,
    ai_overall_feedback: generated.grade.overall_feedback,
    ai_strengths: generated.grade.strengths || [],
    ai_improvements: generated.grade.improvements || [],
    review_status: 'pending',
    show_model_answer: Boolean(assignment.show_model_answer_after_publish),
  };
  if (gradingMethod === 'percentage_v2') {
    report.ai_correctness_percentage = generated.grade.correctness_percentage;
    report.ai_content_analysis = {
      correct_content: generated.grade.correct_content,
      missing_or_incorrect_content: generated.grade.missing_or_incorrect_content,
      contradictions: generated.grade.contradictions,
      confidence: generated.grade.confidence,
    };
    report.ai_criteria_results = null;
  } else {
    report.ai_criteria_results = generated.grade.criteria_results;
  }
  return {
    jobStatus: 'awaiting_review',
    provider: generated.provider,
    model: generated.model,
    usage: generated.usage,
    report,
  };
};

export const createEssayGradingWorker = ({ db, fileReader, gateway, workerId = 'essay-worker', leaseSeconds = 120, maxAttempts = 3, now = () => Date.now() }) => {
  const updateJob = async (id, patch) => {
    const { data, error } = await db.from('essay_grading_jobs').update(patch).eq('id', id).eq('lease_owner', workerId).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    return Boolean(data);
  };
  const runOnce = async () => {
    const { data: job, error } = await db.rpc('claim_essay_grading_job', { p_worker_id: workerId, p_lease_seconds: leaseSeconds });
    if (error) throw new Error(error.message);
    if (!job) return { claimed: false };
    try {
      const [submissionResult, assignmentResult] = await Promise.all([
        db.from('submissions').select('*').eq('id', job.submission_id).single(),
        db.from('assignments').select('id,essay_content,max_score,max_file_size_mb,show_model_answer_after_publish').eq('id', job.assignment_id).single(),
      ]);
      if (submissionResult.error || !submissionResult.data) {
        const unavailable = new Error('Submission file is unavailable.'); unavailable.code = 'FILE_NOT_AVAILABLE'; throw unavailable;
      }
      if (assignmentResult.error || !assignmentResult.data) {
        const invalid = new Error('Essay grading configuration is unavailable.'); invalid.code = 'AI_CONFIGURATION_ERROR'; throw invalid;
      }
      const submission = submissionResult.data;
      const assignment = assignmentResult.data;
      const leaseExpiresAt = () => new Date(now() + leaseSeconds * 1000).toISOString();
      if (!await updateJob(job.id, { status: 'grading', lease_expires_at: leaseExpiresAt(), updated_at: new Date(now()).toISOString() })) {
        return { claimed: true, jobId: job.id, status: 'lease_lost' };
      }
      const result = await processEssayJob({ job, assignment, submission, fileReader, gateway });
      if (!await updateJob(job.id, { status: 'grading', lease_expires_at: leaseExpiresAt(), updated_at: new Date(now()).toISOString() })) {
        return { claimed: true, jobId: job.id, status: 'lease_lost' };
      }
      const { error: reportError } = await db.from('essay_grading_reports').upsert(result.report, { onConflict: 'job_id' });
      if (reportError) throw new Error(reportError.message);
      const completedAt = new Date(now()).toISOString();
      if (!await updateJob(job.id, { status: 'awaiting_review', provider: result.provider, model: result.model, input_tokens: result.usage?.input_tokens ?? null, output_tokens: result.usage?.output_tokens ?? null, error_code: null, completed_at: completedAt, updated_at: completedAt, lease_owner: null, lease_expires_at: null })) {
        return { claimed: true, jobId: job.id, status: 'lease_lost' };
      }
      await db.from('essay_grading_events').insert({ job_id: job.id, event_type: 'analysis_completed', metadata: { provider: result.provider, model: result.model } });
      return { claimed: true, jobId: job.id, status: 'awaiting_review' };
    } catch (error) {
      const attempt = Number(job.attempt_count || 1);
      const code = safeEssayErrorCode(error);
      const retry = RETRYABLE.has(code) && attempt < maxAttempts;
      if (!await updateJob(job.id, { status: retry ? 'queued' : 'failed', error_code: code, next_attempt_at: new Date(now() + (retry ? backoffMs(attempt) : 0)).toISOString(), updated_at: new Date(now()).toISOString(), lease_owner: null, lease_expires_at: null })) {
        return { claimed: true, jobId: job.id, status: 'lease_lost' };
      }
      await db.from('essay_grading_events').insert({ job_id: job.id, event_type: retry ? 'retry_scheduled' : 'analysis_failed', metadata: { error_code: code } });
      return { claimed: true, jobId: job.id, status: retry ? 'queued' : 'failed', retrying: retry };
    }
  };
  const start = ({ intervalMs = 5000 } = {}) => { const timer = setInterval(() => { runOnce().catch(() => {}); }, intervalMs); timer.unref?.(); return () => clearInterval(timer); };
  return { runOnce, start };
};
