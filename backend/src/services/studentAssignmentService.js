export const canReceive = (delivery, userId) =>
  delivery.recipient_mode === 'all'
  || (delivery.assignment_recipients ?? []).some((row) => row.user_id === userId);

export const assignmentStatus = (delivery, now = new Date()) => {
  const latest = delivery.submissions?.[0];
  if (latest?.regrade_status === 'required' || latest?.regrade_status === 'failed') return 'regrade';
  if (latest) return 'submitted';
  if (delivery.due_date && new Date(delivery.due_date) < now) return 'overdue';
  return 'pending';
};

export const scoreResults = (testCases, results, configuredMaxScore = 0) => {
  const pointsById = new Map((testCases ?? []).map((testCase) => [
    testCase.id,
    Number(testCase.points ?? 1),
  ]));
  let score;
  let maxScore;

  if (pointsById.size > 0) {
    maxScore = [...pointsById.values()].reduce((sum, points) => sum + points, 0);
    score = results.reduce((sum, result) =>
      sum + (result.passed ? pointsById.get(result.test_case_id) ?? 0 : 0), 0);
  } else {
    const possible = results.reduce((sum, result) => sum + Number(result.points ?? 1), 0);
    const earned = results.reduce((sum, result) =>
      sum + (result.passed ? Number(result.points ?? 1) : 0), 0);
    maxScore = Number(configuredMaxScore) || possible;
    score = configuredMaxScore && possible > 0
      ? Math.round((earned / possible) * Number(configuredMaxScore))
      : earned;
  }

  return {
    score,
    maxScore,
    rows: results.map((result) => ({
      test_case_id: result.test_case_id || null,
      test_name: result.test_name,
      points: result.points,
      passed: Boolean(result.passed),
      actual_output: result.actual_output || '',
      error_message: result.error_message || '',
    })),
  };
};

const throwDbError = (error) => {
  if (error) throw new Error(error.message);
};

const withoutSolution = (assignment) => {
  if (!assignment) return assignment;
  const { solution_code, ...safe } = assignment;
  return safe;
};

export const createStudentAssignmentService = (db) => {
  const getAuthorizedDelivery = async (userId, deliveryId) => {
    const { data: delivery, error } = await db
      .from('assignment_deliveries')
      .select('*, classes(id,name,grade,subject), assignments:assignment_id(*, test_cases(*)), assignment_recipients(user_id)')
      .eq('id', deliveryId)
      .eq('is_published', true)
      .maybeSingle();
    throwDbError(error);
    if (!delivery) throw new Error('Không tìm thấy bài tập đã giao.');

    const { data: enrollment, error: enrollmentError } = await db
      .from('enrollments')
      .select('id')
      .eq('class_id', delivery.class_id)
      .eq('user_id', userId)
      .maybeSingle();
    throwDbError(enrollmentError);
    if (!enrollment || !canReceive(delivery, userId)) {
      throw new Error('Bạn không được chỉ định làm bài tập này.');
    }
    return { ...delivery, assignments: withoutSolution(delivery.assignments) };
  };

  return {
    async listMine({ userId, status }) {
      const { data: enrollments, error: enrollmentError } = await db
        .from('enrollments')
        .select('class_id')
        .eq('user_id', userId);
      throwDbError(enrollmentError);
      const classIds = (enrollments ?? []).map((row) => row.class_id);
      if (classIds.length === 0) return [];

      const { data: deliveries, error } = await db
        .from('assignment_deliveries')
        .select('*, classes(id,name,grade,subject), assignments:assignment_id(id,title,description,type,starter_code,setup_sql,test_code,max_score,content_version,test_cases(*)), assignment_recipients(user_id), submissions(id,score,max_score,regrade_status,submitted_at)')
        .in('class_id', classIds)
        .eq('is_published', true)
        .eq('submissions.user_id', userId)
        .order('due_date');
      throwDbError(error);

      const visible = (deliveries ?? [])
        .filter((delivery) => canReceive(delivery, userId))
        .map((delivery) => ({ ...delivery, assignment_status: assignmentStatus(delivery) }));
      return status ? visible.filter((delivery) => delivery.assignment_status === status) : visible;
    },

    async getDelivery({ userId, deliveryId }) {
      return getAuthorizedDelivery(userId, deliveryId);
    },

    async submit({ userId, deliveryId, code, results }) {
      const delivery = await getAuthorizedDelivery(userId, deliveryId);
      const { count, error: countError } = await db
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('delivery_id', deliveryId);
      throwDbError(countError);
      if (delivery.max_submissions !== null && count >= delivery.max_submissions) {
        throw new Error(`Bạn đã nộp đủ ${delivery.max_submissions} lần.`);
      }

      const assignment = delivery.assignments;
      const scored = scoreResults(assignment.test_cases, results, assignment.max_score);
      const { data: submission, error } = await db
        .from('submissions')
        .insert([{
          user_id: userId,
          assignment_id: assignment.id,
          delivery_id: deliveryId,
          code,
          score: scored.score,
          max_score: scored.maxScore,
          graded_content_version: assignment.content_version,
          regrade_status: 'current',
        }])
        .select()
        .single();
      throwDbError(error);

      if (scored.rows.length > 0) {
        const { error: resultError } = await db
          .from('submission_results')
          .insert(scored.rows.map((row) => ({ ...row, submission_id: submission.id })));
        throwDbError(resultError);
      }
      return { ...submission, remaining_attempts: delivery.max_submissions === null
        ? null
        : delivery.max_submissions - Number(count ?? 0) - 1 };
    },

    async prepareRegrade({ userId, submissionId }) {
      const { data, error } = await db
        .from('submissions')
        .select('id,code,regrade_status,delivery_id, assignment_deliveries!inner(id,is_published,assignments:assignment_id(id,title,type,starter_code,setup_sql,test_code,max_score,content_version,test_cases(*)))')
        .eq('id', submissionId)
        .eq('user_id', userId)
        .maybeSingle();
      throwDbError(error);
      if (!data || !['required', 'failed'].includes(data.regrade_status)) {
        throw new Error('Bài nộp này không cần chấm lại.');
      }
      return {
        submission_id: data.id,
        code: data.code,
        assignment: withoutSolution(data.assignment_deliveries.assignments),
      };
    },

    async completeRegrade({ userId, submissionId, results }) {
      const prepared = await this.prepareRegrade({ userId, submissionId });
      const assignment = prepared.assignment;
      const expected = assignment.test_cases ?? [];
      if ((expected.length > 0 && results.length < expected.length) || results.length === 0) {
        throw new Error('Kết quả chấm lại chưa đầy đủ; điểm cũ được giữ nguyên.');
      }
      const scored = scoreResults(expected, results, assignment.max_score);

      const { error: deleteError } = await db
        .from('submission_results')
        .delete()
        .eq('submission_id', submissionId);
      throwDbError(deleteError);
      const { error: resultError } = await db
        .from('submission_results')
        .insert(scored.rows.map((row) => ({ ...row, submission_id: submissionId })));
      throwDbError(resultError);
      const { data, error } = await db
        .from('submissions')
        .update({
          score: scored.score,
          max_score: scored.maxScore,
          graded_content_version: assignment.content_version,
          regrade_status: 'current',
          regrade_error: null,
        })
        .eq('id', submissionId)
        .eq('user_id', userId)
        .select()
        .single();
      throwDbError(error);
      return data;
    },
  };
};
