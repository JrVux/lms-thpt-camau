import { createEssayGradingService } from './essayGradingService.js';
import { reportEssayQueueError } from './essayQueueDiagnostics.js';

export const createEssayQueueReconciler = ({
  db,
  ensureQueued,
  reportQueueError = reportEssayQueueError,
  limit = 20,
} = {}) => {
  const ensureEssayQueued = ensureQueued || createEssayGradingService(db).ensureQueued;

  const runOnce = async () => {
    const { data, error } = await db.rpc('list_missing_essay_grading_submissions', { p_limit: limit });
    if (error) throw new Error(error.message);

    const candidates = data || [];
    const result = { scanned: candidates.length, queued: 0, existing: 0, failed: 0 };

    for (const candidate of candidates) {
      const submissionId = candidate?.submission_id;
      let assignmentId = null;
      try {
        const { data: submission, error: submissionError } = await db
          .from('submissions')
          .select('*')
          .eq('id', submissionId)
          .maybeSingle();
        if (submissionError) throw new Error(submissionError.message);
        assignmentId = submission?.assignment_id || null;
        if (!submission?.object_key || !submission.is_latest || !assignmentId) {
          result.existing += 1;
          continue;
        }

        const { data: assignment, error: assignmentError } = await db
          .from('assignments')
          .select('*')
          .eq('id', assignmentId)
          .maybeSingle();
        if (assignmentError) throw new Error(assignmentError.message);
        if (assignment?.submission_type !== 'essay' || !assignment.ai_grading_enabled) {
          result.existing += 1;
          continue;
        }

        const queueResult = await ensureEssayQueued({
          submission,
          assignment,
          studentId: submission.user_id,
        });
        if (queueResult?.created) result.queued += 1;
        else result.existing += 1;
      } catch (queueError) {
        result.failed += 1;
        reportQueueError({
          operation: 'reconcile_missing_job',
          submissionId,
          assignmentId,
          error: queueError,
        });
      }
    }

    return result;
  };

  const start = ({ intervalMs = 30000 } = {}) => {
    const timer = setInterval(() => {
      runOnce().catch((error) => reportQueueError({ operation: 'reconcile_batch', error }));
    }, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
  };

  return { runOnce, start };
};
