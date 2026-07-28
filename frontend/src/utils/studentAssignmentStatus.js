export const assignmentStatus = (delivery, latestSubmission, now = new Date()) => {
  if (['required', 'failed'].includes(latestSubmission?.regrade_status)) return 'regrade';
  if (latestSubmission) return 'submitted';
  if (delivery.due_date && new Date(delivery.due_date) < now) return 'overdue';
  return 'pending';
};

export const runPendingRegrade = async ({ submission, assignment, runner }) => {
  if (!['required', 'failed'].includes(submission.regrade_status)) return null;
  const results = await runner({ code: submission.code, assignment });
  return { submissionId: submission.id, results };
};
