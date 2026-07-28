import { supabase } from './supabaseClient.js';
import { scoreResults } from './studentAssignmentService.js';
export { scoreResults };

const resolveAuthorizedDelivery = async (assignmentId, userId) => {
  const { data: deliveries, error } = await supabase
    .from('assignment_deliveries')
    .select('id,class_id,due_date,max_submissions,is_published,recipient_mode,assignment_recipients(user_id)')
    .eq('assignment_id', assignmentId)
    .eq('is_published', true);
  if (error) throw new Error('Không thể kiểm tra quyền nhận bài.');
  const classIds = (deliveries ?? []).map((delivery) => delivery.class_id);
  if (classIds.length === 0) throw new Error('Bạn không được chỉ định làm bài tập này.');
  const { data: enrollments, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('class_id')
    .eq('user_id', userId)
    .in('class_id', classIds);
  if (enrollmentError) throw new Error('Không thể kiểm tra lớp của học sinh.');
  const enrolledClassIds = new Set((enrollments ?? []).map((row) => row.class_id));
  const delivery = deliveries.find((item) => enrolledClassIds.has(item.class_id)
    && (item.recipient_mode === 'all'
      || item.assignment_recipients?.some((row) => row.user_id === userId)));
  if (!delivery) throw new Error('Bạn không được chỉ định làm bài tập này.');
  if (delivery.due_date && new Date(delivery.due_date) < new Date()) {
    throw new Error('Bài tập đã quá hạn nộp.');
  }
  return delivery;
};

// Nộp bài (tạo mới hoặc cập nhật nếu đã nộp)
export const submit = async ({ assignment_id, code, results }, userId) => {
  // Lấy thông tin assignment và test cases để tính điểm
  const { data: assignment, error: assignError } = await supabase
    .from('assignments')
    .select('id, max_score, content_version, test_cases(*)')
    .eq('id', assignment_id)
    .single();

  if (assignError || !assignment) {
    throw new Error('Không tìm thấy bài tập');
  }

  const delivery = await resolveAuthorizedDelivery(assignment_id, userId);
  const maxSubmissions = delivery.max_submissions;

  // Kiểm tra số lần nộp bài
  const { count, error: countError } = await supabase
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('delivery_id', delivery.id);

  if (countError) throw new Error('Lỗi kiểm tra số lần nộp bài');

  const attempted = count || 0;

  if (maxSubmissions !== null && attempted >= maxSubmissions) {
    throw new Error(`Bạn đã nộp đủ ${maxSubmissions} lần, không thể nộp thêm`);
  }

  // Tính score
  const scored = scoreResults(assignment.test_cases, results, assignment.max_score);
  const score = scored.score;
  const max_score = scored.maxScore;

  // Luôn INSERT (cho phép nhiều lần nộp)
  const { data: created, error: createError } = await supabase.rpc('create_submission_with_results', {
    p_user_id: userId,
    p_assignment_id: assignment_id,
    p_delivery_id: delivery.id,
    p_code: code,
    p_score: score,
    p_max_score: max_score,
    p_content_version: assignment.content_version,
    p_results: scored.rows,
  });

  if (createError) throw new Error('Nộp bài thất bại');
  const submissionId = created.id;

  const remaining = maxSubmissions !== null ? maxSubmissions - attempted - 1 : null;

  return { submission_id: submissionId, score, max_score, remaining_attempts: remaining };
};

// Lấy gradebook (ma trận học sinh × bài tập)
export const buildLatestSubmissionMap = (submissions) => {
  const submissionMap = {};
  const seen = new Set();
  for (const sub of submissions) {
    const key = `${sub.user_id}_${sub.delivery_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    submissionMap[key] = {
      id: sub.id,
      score: sub.score,
      max_score: sub.max_score,
      submitted_at: sub.submitted_at,
    };
  }
  return submissionMap;
};

export const getGradebook = async (classId, teacherId) => {
  // Kiểm tra quyền sở hữu lớp
  const { data: classData } = await supabase
    .from('classes')
    .select('id, teacher_id')
    .eq('id', classId)
    .single();

  if (!classData || classData.teacher_id !== teacherId) {
    throw new Error('Bạn không phải giáo viên của lớp này');
  }

  // Lấy danh sách học sinh
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('user_id, users(full_name, username, email)')
    .eq('class_id', classId);

  const students = enrollments.map((e) => ({
    user_id: e.user_id,
    full_name: e.users.full_name,
    username: e.users.username,
    email: e.users.email,
  }));

  // Lấy danh sách bài tập
  const { data: deliveries } = await supabase
    .from('assignment_deliveries')
    .select('id, assignment_id, assignments:assignment_id(title,type,max_score)')
    .eq('class_id', classId)
    .order('created_at', { ascending: true });
  const assignments = (deliveries ?? []).map((delivery) => ({
    id: delivery.id,
    delivery_id: delivery.id,
    assignment_id: delivery.assignment_id,
    ...delivery.assignments,
  }));

  // Lấy tất cả submissions của lớp này
  const assignmentIds = assignments.map((a) => a.id);
  const studentIds = students.map((s) => s.user_id);

  let submissions = [];
  if (assignmentIds.length > 0 && studentIds.length > 0) {
    const { data } = await supabase
      .from('submissions')
      .select('id, user_id, delivery_id, score, max_score, submitted_at')
      .in('delivery_id', assignmentIds)
      .in('user_id', studentIds)
      .order('submitted_at', { ascending: false });
    submissions = data || [];
  }

  // Xây ma trận (chỉ lấy bài nộp mới nhất của mỗi cặp học sinh × bài tập)
  const submissionMap = buildLatestSubmissionMap(submissions);

  const rows = students.map((student) => {
    const row = {
      student,
      assignments: {},
    };
    for (const a of assignments) {
      const key = `${student.user_id}_${a.id}`;
      row.assignments[a.id] = submissionMap[key] || null;
    }
    return row;
  });

  return { assignments, rows };
};

export const getSubmissionForTeacher = async (classId, submissionId, teacherId) => {
  const { data: submission, error: submissionError } = await supabase
    .from('submissions')
    .select('id,user_id,assignment_id,delivery_id,code,score,max_score,submitted_at')
    .eq('id', submissionId)
    .single();
  if (submissionError || !submission) throw new Error('Không tìm thấy bài nộp');

  const { data: delivery, error: deliveryError } = await supabase
    .from('assignment_deliveries')
    .select('id,class_id')
    .eq('id', submission.delivery_id)
    .single();
  if (deliveryError || !delivery || delivery.class_id !== classId) {
    throw new Error('Bài nộp không thuộc lớp này');
  }

  const { data: classData } = await supabase
    .from('classes')
    .select('id,teacher_id')
    .eq('id', delivery.class_id)
    .single();
  if (!classData || classData.teacher_id !== teacherId) {
    throw new Error('Bạn không phải giáo viên của lớp này');
  }

  const [{ data: student }, { data: assignment }, { data: results, error: resultsError }] = await Promise.all([
    supabase.from('users').select('id,full_name,username,email').eq('id', submission.user_id).single(),
    supabase.from('assignments').select('id,title,type').eq('id', submission.assignment_id).single(),
    supabase
      .from('submission_results')
      .select('id,test_name,points,passed,actual_output,error_message,test_case:test_cases(input_data,expected_output)')
      .eq('submission_id', submission.id),
  ]);
  if (resultsError) throw new Error('Không thể tải kết quả chấm bài');

  return { ...submission, student, assignment, results: results ?? [] };
};

// Export gradebook CSV
export const exportGradebookCSV = async (classId, teacherId) => {
  const { assignments, rows } = await getGradebook(classId, teacherId);

  // Header
  const headers = ['Họ tên', 'Username', 'Email', ...assignments.map((a) => a.title)];

  // Data rows
  const csvRows = [headers.join(',')];
  for (const row of rows) {
    const values = [
      row.student.full_name,
      row.student.username,
      row.student.email,
      ...assignments.map((a) => {
        const sub = row.assignments[a.id];
        if (!sub) return '';
        return `${sub.score}/${sub.max_score}`;
      }),
    ];
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
};

// Lấy bài nộp của học sinh cho một bài tập
export const getMySubmission = async (assignmentId, userId) => {
  const { data: list, error } = await supabase
    .from('submissions')
    .select(`
      *,
      submission_results(
        *,
        test_case:test_cases(test_name, points, input_data, expected_output)
      )
    `)
    .eq('user_id', userId)
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false })
    .limit(1);

  // Lấy thông tin max_submissions và số lần đã nộp
  const { count } = await supabase
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('assignment_id', assignmentId);

  let maxSubmissions = null;
  try {
    const { data: assignInfo } = await supabase
      .from('assignments')
      .select('max_submissions')
      .eq('id', assignmentId)
      .single();
    if (assignInfo) maxSubmissions = assignInfo.max_submissions;
  } catch {}

  const attempted = count || 0;
  const remaining = maxSubmissions !== null ? maxSubmissions - attempted : null;

  if (error || !list || list.length === 0) {
    return { data: null, attempted, max_submissions: maxSubmissions, remaining_attempts: remaining };
  }

  return { data: list[0], attempted, max_submissions: maxSubmissions, remaining_attempts: remaining };
};
