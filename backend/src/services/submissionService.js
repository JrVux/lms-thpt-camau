import { supabase } from './supabaseClient.js';

// Nộp bài (tạo mới hoặc cập nhật nếu đã nộp)
export const submit = async ({ assignment_id, code, results }, userId) => {
  // Lấy thông tin assignment và test cases để tính điểm
  const { data: assignment, error: assignError } = await supabase
    .from('assignments')
    .select('id, max_score, is_published, test_cases(*)')
    .eq('id', assignment_id)
    .single();

  if (assignError || !assignment) {
    throw new Error('Không tìm thấy bài tập');
  }

  if (!assignment.is_published) {
    throw new Error('Bài tập chưa được publish');
  }

  // Lấy max_submissions (có thể chưa có column trong DB)
  let maxSubmissions = null;
  try {
    const { data: colData } = await supabase
      .from('assignments')
      .select('max_submissions')
      .eq('id', assignment_id)
      .single();
    if (colData) maxSubmissions = colData.max_submissions;
  } catch {}

  // Kiểm tra số lần nộp bài
  const { count, error: countError } = await supabase
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('assignment_id', assignment_id);

  if (countError) throw new Error('Lỗi kiểm tra số lần nộp bài');

  const attempted = count || 0;

  if (maxSubmissions !== null && attempted >= maxSubmissions) {
    throw new Error(`Bạn đã nộp đủ ${maxSubmissions} lần, không thể nộp thêm`);
  }

  // Tính score
  let score = 0;
  let max_score = assignment.max_score || 0;

  if (assignment.test_cases && assignment.test_cases.length > 0) {
    // SQL/HTML: test cases có trong DB, dùng pointsMap
    const pointsMap = {};
    for (const tc of assignment.test_cases) {
      pointsMap[tc.id] = tc.points;
    }
    for (const r of results) {
      if (r.passed && pointsMap[r.test_case_id]) {
        score += pointsMap[r.test_case_id];
      }
    }
  } else {
    // Python: test suites từ test_code, tính từ results
    const totalTestPoints = results.reduce((sum, r) => sum + (r.points || 1), 0);
    const earned = results.reduce((sum, r) => sum + (r.passed ? (r.points || 1) : 0), 0);
    if (max_score && totalTestPoints > 0) {
      // Nếu teacher set max_score, tính score theo tỉ lệ
      score = Math.round((earned / totalTestPoints) * max_score);
    } else {
      score = earned;
      max_score = totalTestPoints;
    }
  }

  // Luôn INSERT (cho phép nhiều lần nộp)
  const { data: created, error: createError } = await supabase
    .from('submissions')
    .insert([{ user_id: userId, assignment_id, code, score, max_score }])
    .select('*')
    .single();

  if (createError) throw new Error('Nộp bài thất bại');
  const submissionId = created.id;

  // Thêm submission_results mới
  if (results.length > 0) {
    const resultRows = results.map((r) => {
      const row = {
        submission_id: submissionId,
        test_case_id: r.test_case_id || null,
        passed: r.passed,
        actual_output: r.actual_output || '',
        error_message: r.error_message || '',
      };
      if (r.test_name !== undefined) row.test_name = r.test_name;
      if (r.points !== undefined) row.points = r.points;
      return row;
    });

    const { error: resultError } = await supabase
      .from('submission_results')
      .insert(resultRows);

    if (resultError) {
      // Thử lại không có test_name / points (cột chưa tồn tại trong DB)
      const fallbackRows = resultRows.map((r) => ({
        submission_id: r.submission_id,
        test_case_id: r.test_case_id,
        passed: r.passed,
        actual_output: r.actual_output,
        error_message: r.error_message,
      }));
      const { error: fallbackError } = await supabase
        .from('submission_results')
        .insert(fallbackRows);
      if (fallbackError) throw new Error('Lưu kết quả test thất bại');
    }
  }

  const remaining = maxSubmissions !== null ? maxSubmissions - attempted - 1 : null;

  return { submission_id: submissionId, score, max_score, remaining_attempts: remaining };
};

// Lấy gradebook (ma trận học sinh × bài tập)
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
  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, title, type, max_score')
    .eq('class_id', classId)
    .order('created_at', { ascending: true });

  // Lấy tất cả submissions của lớp này
  const assignmentIds = assignments.map((a) => a.id);
  const studentIds = students.map((s) => s.user_id);

  let submissions = [];
  if (assignmentIds.length > 0 && studentIds.length > 0) {
    const { data } = await supabase
      .from('submissions')
      .select('user_id, assignment_id, score, max_score, submitted_at')
      .in('assignment_id', assignmentIds)
      .in('user_id', studentIds)
      .order('submitted_at', { ascending: false });
    submissions = data || [];
  }

  // Xây ma trận (chỉ lấy bài nộp mới nhất của mỗi cặp học sinh × bài tập)
  const submissionMap = {};
  const seen = new Set();
  for (const sub of submissions) {
    const key = `${sub.user_id}_${sub.assignment_id}`;
    if (seen.has(key)) continue; // bỏ qua các bản ghi cũ hơn
    seen.add(key);
    submissionMap[key] = {
      score: sub.score,
      max_score: sub.max_score,
      submitted_at: sub.submitted_at,
    };
  }

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
