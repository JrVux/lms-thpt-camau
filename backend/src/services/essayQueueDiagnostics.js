export const reportEssayQueueError = ({ operation, submissionId, assignmentId, error }) => {
  console.error(JSON.stringify({
    level: 'error',
    message: 'Essay grading enqueue failed',
    operation,
    submission_id: submissionId || null,
    assignment_id: assignmentId || null,
    error: String(error?.message || error || 'unknown').slice(0, 500),
  }));
};
