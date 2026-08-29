export const canReceive = (delivery, userId) =>
  delivery.recipient_mode === 'all'
  || (delivery.assignment_recipients ?? []).some((row) => row.user_id === userId);

export const assignmentStatus = (delivery, now = new Date()) => {
  const latest = [...(delivery.submissions ?? [])]
    .sort((left, right) => new Date(right.submitted_at) - new Date(left.submitted_at))[0];
  if (latest?.object_key != null || latest?.file_name != null) {
    if (latest.graded_at) return 'graded';
    if (latest.is_late) return 'late';
    return 'submitted';
  }
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

  const hasTestIds = results.some((result) => result.test_case_id != null);
  if (pointsById.size > 0 && hasTestIds) {
    const resultIds = results.map((result) => result.test_case_id);
    const uniqueResultIds = new Set(resultIds);
    const exactCurrentTests = results.length === pointsById.size
      && uniqueResultIds.size === pointsById.size
      && resultIds.every((id) => pointsById.has(id));
    if (!exactCurrentTests) {
      throw new Error('Kết quả chấm không đầy đủ hoặc bị trùng so với test hiện tại.');
    }
    maxScore = [...pointsById.values()].reduce((sum, points) => sum + points, 0);
    score = results.reduce((sum, result) =>
      sum + (result.passed ? pointsById.get(result.test_case_id) ?? 0 : 0), 0);
  } else {
    const browserTestNames = results.map((result, index) => result.test_name || `test-${index}`);
    if (new Set(browserTestNames).size !== browserTestNames.length) {
      throw new Error('Kết quả chấm trình duyệt bị trùng.');
    }
    const possible = results.length;
    const earned = results.filter((result) => result.passed).length;
    maxScore = Number(configuredMaxScore) > 0 ? Number(configuredMaxScore) : 10;
    score = possible > 0 ? Math.round((earned / possible) * maxScore) : 0;
    score = Math.min(score, maxScore);
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
  const markRegradeFailed = async (userId, submissionId, message) => {
    await db
      .from('submissions')
      .update({ regrade_status: 'failed', regrade_error: message })
      .eq('id', submissionId)
      .eq('user_id', userId);
  };

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
    const { data: submissions, error: submissionError } = await db
      .from('submissions')
      .select('id,code,score,max_score,regrade_status,submitted_at')
      .eq('delivery_id', deliveryId)
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false });
    throwDbError(submissionError);
    return {
      ...delivery,
      assignments: withoutSolution(delivery.assignments),
      submissions: submissions ?? [],
    };
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
        .select('*, classes(id,name,grade,subject), assignments:assignment_id(id,title,description,type,submission_type,essay_content,allowed_mime_types,max_file_size_mb,allow_late_submission,starter_code,setup_sql,test_code,max_score,content_version,test_cases(*)), assignment_recipients(user_id), submissions(id,user_id,score,max_score,regrade_status,object_key,file_name,mime_type,file_size,is_late,is_latest,feedback,graded_at,submitted_at)')
        .in('class_id', classIds)
        .eq('is_published', true)
        .order('due_date');
      throwDbError(error);

      const visible = (deliveries ?? [])
        .filter((delivery) => canReceive(delivery, userId))
        .map((delivery) => {
          const studentSubmissions = (delivery.submissions ?? []).filter((s) => s.user_id === userId);
          const deliveryForUser = { ...delivery, submissions: studentSubmissions };
          return { ...deliveryForUser, assignment_status: assignmentStatus(deliveryForUser) };
        });
      return status ? visible.filter((delivery) => delivery.assignment_status === status) : visible;
    },

    async getDelivery({ userId, deliveryId }) {
      return getAuthorizedDelivery(userId, deliveryId);
    },

    async submit({ userId, deliveryId, code, results }) {
      const delivery = await getAuthorizedDelivery(userId, deliveryId);
      if (delivery.due_date && new Date(delivery.due_date) < new Date()) {
        throw new Error('Bài tập đã quá hạn nộp.');
      }
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
      const { data: submission, error } = await db.rpc('create_submission_with_results', {
        p_user_id: userId,
        p_assignment_id: assignment.id,
        p_delivery_id: deliveryId,
        p_code: code,
        p_score: scored.score,
        p_max_score: scored.maxScore,
        p_content_version: assignment.content_version,
        p_results: scored.rows,
      });
      throwDbError(error);
      return { ...submission, remaining_attempts: delivery.max_submissions === null
        ? null
        : delivery.max_submissions - Number(count ?? 0) - 1 };
    },

    async prepareRegrade({ userId, submissionId }) {
      const { data, error } = await db
        .from('submissions')
        .select('id,code,regrade_status,delivery_id')
        .eq('id', submissionId)
        .eq('user_id', userId)
        .maybeSingle();
      throwDbError(error);
      if (!data || !['required', 'failed'].includes(data.regrade_status)) {
        throw new Error('Bài nộp này không cần chấm lại.');
      }
      const delivery = await getAuthorizedDelivery(userId, data.delivery_id);
      return {
        submission_id: data.id,
        code: data.code,
        assignment: delivery.assignments,
      };
    },

    async completeRegrade({ userId, submissionId, results }) {
      const prepared = await this.prepareRegrade({ userId, submissionId });
      const assignment = prepared.assignment;
      const expected = assignment.test_cases ?? [];
      const hasTestIds = results.some((result) => result.test_case_id != null);
      if ((hasTestIds && expected.length > 0 && results.length < expected.length) || results.length === 0) {
        await markRegradeFailed(userId, submissionId, 'Kết quả chấm lại chưa đầy đủ.');
        throw new Error('Kết quả chấm lại chưa đầy đủ; điểm cũ được giữ nguyên.');
      }
      let scored;
      try {
        scored = scoreResults(expected, results, assignment.max_score);
      } catch (error) {
        await markRegradeFailed(userId, submissionId, error.message);
        throw error;
      }

      const { data, error } = await db.rpc('complete_submission_regrade', {
        p_submission_id: submissionId,
        p_user_id: userId,
        p_score: scored.score,
        p_max_score: scored.maxScore,
        p_content_version: assignment.content_version,
        p_results: scored.rows,
      });
      if (error) {
        await markRegradeFailed(userId, submissionId, error.message);
        throwDbError(error);
      }
      return data;
    },
  };
};
