const SAFE_CODES = new Set(['AI_TIMEOUT', 'AI_PROVIDER_ERROR', 'AI_RATE_LIMITED', 'AI_CONFIGURATION_ERROR', 'AI_ESSAY_INVALID', 'FILE_NOT_AVAILABLE', 'FILE_INVALID', 'FILE_TOO_LARGE']);
const RETRYABLE = new Set(['AI_TIMEOUT', 'AI_PROVIDER_ERROR', 'FILE_NOT_AVAILABLE']);
const backoffMs = (attempt) => Math.min(60_000 * (2 ** Math.max(0, attempt - 1)), 900_000);
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };

const escapeBoundary = (value) => String(value || 'file')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export const combineExtractedFiles = (results, maxChars = Number(process.env.AI_ESSAY_MAX_EXTRACTED_CHARS || 100000)) => {
  const readable = (results || []).filter((item) => item.extractedText?.trim());
  if (!readable.length) fail('FILE_NOT_AVAILABLE', 'Không đọc được nội dung từ bộ file bài làm.');
  const text = readable.map((item) => `<submission_file index="${Number(item.sortOrder) + 1}" name="${escapeBoundary(item.fileName)}">\n${item.extractedText.trim()}\n</submission_file>`).join('\n');
  if (text.length > maxChars) fail('AI_ESSAY_INVALID', 'Tổng nội dung bài làm vượt giới hạn xử lý an toàn.');
  return text;
};

export const safeEssayErrorCode = (error) => SAFE_CODES.has(error?.code) ? error.code : 'AI_ESSAY_FAILED';

export const processEssayJob = async ({ job, assignment, submission, files = [], fileReader, gateway }) => {
  if (typeof fileReader.readMany === 'function') {
    const inputs = await fileReader.readMany({ submission, files, assignment });
    const extracted = [];
    const fileWarnings = [];
    for (const input of inputs) {
      let result = input;
      if (input.file) {
        const vision = await gateway.extractFile({ file: input.file, fileName: input.fileName });
        result = { ...input, extractedText: vision.extractedText, quality: vision.quality, warnings: [...(input.warnings || []), ...(vision.warnings || [])] };
      }
      for (const warning of result.warnings || []) fileWarnings.push(`${result.fileName}: ${warning}`);
      if (!result.extractedText?.trim()) fileWarnings.push(`${result.fileName}: Không đọc được nội dung.`);
      extracted.push(result);
    }
    const combinedText = combineExtractedFiles(extracted);
    const gradingMethod = job.grading_method || 'rubric_v1';
    const generated = await gateway.generate({
      gradingMethod,
      question: assignment.essay_content,
      modelAnswer: job.model_answer_snapshot,
      rubric: job.rubric_snapshot,
      maxScore: assignment.max_score,
      extractedText: combinedText,
    });
    const report = buildReport({ job, assignment, gradingMethod, generated, input: {
      extractedText: combinedText,
      extractionMethod: 'multi_file',
      warnings: fileWarnings,
    } });
    return { jobStatus: 'awaiting_review', provider: generated.provider, model: generated.model, usage: generated.usage, report };
  }
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
  const report = buildReport({ job, assignment, gradingMethod, generated, input });
  return {
    jobStatus: 'awaiting_review',
    provider: generated.provider,
    model: generated.model,
    usage: generated.usage,
    report,
  };
};

const buildReport = ({ job, assignment, gradingMethod, generated, input }) => {
  const report = {
    job_id: job.id, submission_id: job.submission_id, source: 'ai', grading_method: gradingMethod,
    extracted_text: input.extractedText || generated.grade.extracted_text || '',
    extraction_method: input.extractionMethod,
    extraction_quality: (input.warnings?.length ? 'uncertain' : generated.grade.extraction_quality),
    extraction_warnings: [...(input.warnings || []), ...(generated.grade.extraction_warnings || [])],
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
  return report;
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
      let files = [];
      if (typeof fileReader.readMany === 'function') {
        const fileResult = await db.from('submission_files').select('*').eq('submission_id', submission.id).order('sort_order');
        if (fileResult.error) throw new Error(fileResult.error.message);
        files = fileResult.data || [];
      }
      const leaseExpiresAt = () => new Date(now() + leaseSeconds * 1000).toISOString();
      if (!await updateJob(job.id, { status: 'grading', lease_expires_at: leaseExpiresAt(), updated_at: new Date(now()).toISOString() })) {
        return { claimed: true, jobId: job.id, status: 'lease_lost' };
      }
      const result = await processEssayJob({ job, assignment, submission, files, fileReader, gateway });
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
      const rateLimited = code === 'AI_RATE_LIMITED';
      const retry = rateLimited || (RETRYABLE.has(code) && attempt < maxAttempts);
      const delay = rateLimited
        ? Math.max(1000, Number(error.retryAfterMs) || 60000)
        : backoffMs(attempt);
      const patch = {
        status: retry ? 'queued' : 'failed',
        error_code: code,
        next_attempt_at: new Date(now() + (retry ? delay : 0)).toISOString(),
        updated_at: new Date(now()).toISOString(),
        lease_owner: null,
        lease_expires_at: null,
      };
      if (rateLimited) patch.attempt_count = Math.max(0, attempt - 1);
      if (!await updateJob(job.id, patch)) {
        return { claimed: true, jobId: job.id, status: 'lease_lost' };
      }
      await db.from('essay_grading_events').insert({ job_id: job.id, event_type: retry ? 'retry_scheduled' : 'analysis_failed', metadata: { error_code: code } });
      return { claimed: true, jobId: job.id, status: retry ? 'queued' : 'failed', retrying: retry };
    }
  };
  const start = ({ intervalMs = 5000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) => {
    let stopped = false;
    let timer = null;
    const schedule = () => {
      if (stopped) return;
      timer = setTimer(tick, intervalMs);
      timer?.unref?.();
    };
    const tick = async () => {
      try { await runOnce(); } catch { /* isolate one worker tick */ }
      finally { schedule(); }
    };
    schedule();
    return () => {
      stopped = true;
      if (timer !== null) clearTimer(timer);
    };
  };
  return { runOnce, start };
};
