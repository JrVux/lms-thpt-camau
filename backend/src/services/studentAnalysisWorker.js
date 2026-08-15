import { STUDENT_ANALYSIS_SCHEMA_VERSION, STUDENT_ANALYSIS_PROMPT_VERSION } from '../ai/studentAnalysisSchema.js';

const backoffMs = (attemptCount, max) => Math.min(60000 * 2 ** (attemptCount - 1), 900000);

export const createStudentAnalysisWorker = ({ db, evidenceService, gateway, workerId = 'worker', leaseSeconds = 120, maxAttempts = 3, now = () => Date.now() }) => {
  const runOnce = async () => {
    const { data: job, error } = await db.rpc('claim_student_analysis_job', { p_worker_id: workerId, p_lease_seconds: leaseSeconds });
    if (error) throw new Error(error.message);
    if (!job) return { claimed: false };

    const jobId = job.id;
    try {
      await db.from('student_analysis_jobs').update({ status: 'analyzing', updated_at: new Date(now()).toISOString() }).eq('id', jobId);

      const { bundle, fingerprint } = await evidenceService.buildBundle({
        teacherId: job.requested_by,
        classId: job.class_id,
        studentId: job.student_id,
        scope: job.scope,
        confirmSparseData: true,
      });

      if (fingerprint !== job.evidence_fingerprint) {
        await db.from('student_analysis_jobs').update({ status: 'stale', updated_at: new Date(now()).toISOString() }).eq('id', jobId);
        return { claimed: true, jobId, status: 'stale' };
      }

      const { analysis, provider, model, usage } = await gateway.generate(bundle);

      const { data: existing } = await db.from('student_analysis_reports').select('id').eq('job_id', jobId).maybeSingle();
      const reportPayload = {
        job_id: jobId,
        schema_version: STUDENT_ANALYSIS_SCHEMA_VERSION,
        ai_teacher_report: analysis.teacher_report,
        ai_student_report: analysis.student_report,
        review_status: 'pending',
      };
      if (existing) {
        await db.from('student_analysis_reports').update(reportPayload).eq('id', existing.id);
      } else {
        await db.from('student_analysis_reports').insert(reportPayload);
      }

      const completedAt = new Date(now()).toISOString();
      await db.from('student_analysis_jobs').update({
        status: 'awaiting_review',
        provider,
        model,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
        latency_ms: usage?.latency_ms ?? null,
        prompt_version: STUDENT_ANALYSIS_PROMPT_VERSION,
        error_code: null,
        completed_at: completedAt,
        updated_at: completedAt,
      }).eq('id', jobId);

      await db.from('student_analysis_events').insert({ job_id: jobId, report_id: existing?.id ?? null, event_type: 'analysis_completed', actor_id: job.requested_by, metadata: { provider, model } });

      return { claimed: true, jobId, status: 'awaiting_review' };
    } catch (err) {
      const attemptCount = (job.attempt_count ?? 0) + 1;
      const safeCode = ['AI_PROVIDER_ERROR', 'AI_ANALYSIS_INVALID', 'AI_CONFIGURATION_ERROR'].includes(err?.code) ? err.code : 'AI_ANALYSIS_FAILED';
      if (attemptCount >= maxAttempts) {
        await db.from('student_analysis_jobs').update({
          status: 'failed',
          attempt_count: attemptCount,
          error_code: safeCode,
          next_attempt_at: new Date(now()).toISOString(),
          updated_at: new Date(now()).toISOString(),
        }).eq('id', jobId);
        return { claimed: true, jobId, status: 'failed' };
      }
      const delay = backoffMs(attemptCount, maxAttempts);
      await db.from('student_analysis_jobs').update({
        status: 'queued',
        attempt_count: attemptCount,
        error_code: safeCode,
        next_attempt_at: new Date(now() + delay).toISOString(),
        updated_at: new Date(now()).toISOString(),
      }).eq('id', jobId);
      return { claimed: true, jobId, status: 'queued', retrying: true };
    }
  };

  const start = ({ intervalMs = 5000 } = {}) => {
    const timer = setInterval(() => { runOnce().catch(() => {}); }, intervalMs);
    if (timer.unref) timer.unref();
    return () => clearInterval(timer);
  };

  return { runOnce, start };
};
