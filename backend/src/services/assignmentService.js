import { supabase } from './supabaseClient.js';

// Tạo bài tập mới
export const createAssignment = async (data, teacherId) => {
  const { class_id, title, description, type, starter_code, solution_code, due_date } = data;

  // Kiểm tra lớp tồn tại và teacher sở hữu lớp
  const { data: classData, error: classError } = await supabase
    .from('classes')
    .select('id, subject, teacher_id')
    .eq('id', class_id)
    .single();

  if (classError || !classData) {
    throw new Error('Không tìm thấy lớp');
  }

  if (classData.teacher_id !== teacherId) {
    throw new Error('Bạn không phải giáo viên của lớp này');
  }

  // Validate type khớp với subject của lớp
  if (type !== classData.subject) {
    throw new Error(`Loại bài tập không khớp với môn học của lớp (${classData.subject})`);
  }

  const { data: assignment, error } = await supabase
    .from('assignments')
    .insert([{ class_id, title, description, type, starter_code, solution_code, setup_sql: data.setup_sql, test_code: data.test_code, due_date, max_submissions: data.max_submissions ? parseInt(data.max_submissions) : null, max_score: data.max_score ? parseInt(data.max_score) : 0 }])
    .select('*')
    .single();

  if (error) {
    throw new Error('Tạo bài tập thất bại: ' + error.message);
  }

  return assignment;
};

// Cập nhật bài tập (cho phép sửa sau khi publish)
export const updateAssignment = async (assignmentId, data, teacherId) => {
  const { data: assignment, error: assignError } = await supabase
    .from('assignments')
    .select('id, class_id, classes!inner(teacher_id)')
    .eq('id', assignmentId)
    .single();

  if (assignError || !assignment) {
    throw new Error('Không tìm thấy bài tập');
  }

  if (assignment.classes.teacher_id !== teacherId) {
    throw new Error('Bạn không phải giáo viên của lớp này');
  }

  const updates = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.starter_code !== undefined) updates.starter_code = data.starter_code;
  if (data.solution_code !== undefined) updates.solution_code = data.solution_code;
  if (data.test_code !== undefined) updates.test_code = data.test_code;
  if (data.setup_sql !== undefined) updates.setup_sql = data.setup_sql;
  if (data.due_date !== undefined) updates.due_date = data.due_date;
  if (data.max_submissions !== undefined) updates.max_submissions = data.max_submissions === null ? null : parseInt(data.max_submissions);
  if (data.max_score !== undefined) updates.max_score = parseInt(data.max_score) || 0;

  const { data: updated, error } = await supabase
    .from('assignments')
    .update(updates)
    .eq('id', assignmentId)
    .select('*')
    .single();

  if (error) throw new Error('Cập nhật bài tập thất bại: ' + error.message);
  return updated;
};

// Thêm / cập nhật test cases cho bài tập
export const upsertTestCases = async (assignmentId, testCases, teacherId) => {
  // Kiểm tra quyền sở hữu
  const { data: assignment, error: assignError } = await supabase
    .from('assignments')
    .select('id, class_id, classes!inner(teacher_id)')
    .eq('id', assignmentId)
    .single();

  if (assignError || !assignment) {
    throw new Error('Không tìm thấy bài tập');
  }

  if (assignment.classes.teacher_id !== teacherId) {
    throw new Error('Bạn không phải giáo viên của lớp này');
  }

  // Xóa test cases cũ
  await supabase.from('test_cases').delete().eq('assignment_id', assignmentId);

  // Thêm test cases mới với order_index
  const newTestCases = testCases.map((tc, index) => ({
    assignment_id: assignmentId,
    input_data: tc.input_data || '',
    expected_output: tc.expected_output,
    test_name: tc.test_name || `Test ${index + 1}`,
    points: tc.points || 1,
    order_index: index,
  }));

  const { data: inserted, error } = await supabase
    .from('test_cases')
    .insert(newTestCases)
    .select('*');

  if (error) {
    throw new Error('Lưu test cases thất bại: ' + error.message);
  }

  // Tính max_score = tổng points
  const max_score = newTestCases.reduce((sum, tc) => sum + tc.points, 0);

  // Cập nhật max_score vào assignment
  await supabase
    .from('assignments')
    .update({ max_score })
    .eq('id', assignmentId);

  return { test_cases: inserted, max_score };
};

// Lấy chi tiết bài tập kèm test cases
export const getAssignment = async (assignmentId, userId, role) => {
  const query = supabase
    .from('assignments')
    .select(`
      *,
      test_cases(*),
      classes!inner(teacher_id)
    `)
    .eq('id', assignmentId);

  // Student chỉ thấy bài đã publish
  if (role === 'student') {
    query.eq('is_published', true);
  }

  const { data: assignment, error } = await query.single();

  if (error || !assignment) {
    throw new Error('Không tìm thấy bài tập');
  }

  // Ẩn solution_code với student
  if (role === 'student') {
    delete assignment.solution_code;
  }

  return assignment;
};

// Publish / unpublish bài tập
export const togglePublish = async (assignmentId, teacherId) => {
  const { data: assignment, error: assignError } = await supabase
    .from('assignments')
    .select('id, is_published, classes!inner(teacher_id)')
    .eq('id', assignmentId)
    .single();

  if (assignError || !assignment) {
    throw new Error('Không tìm thấy bài tập');
  }

  if (assignment.classes.teacher_id !== teacherId) {
    throw new Error('Bạn không phải giáo viên của lớp này');
  }

  const newStatus = !assignment.is_published;

  const { data: updated, error } = await supabase
    .from('assignments')
    .update({ is_published: newStatus })
    .eq('id', assignmentId)
    .select('*')
    .single();

  if (error) {
    throw new Error('Cập nhật thất bại');
  }

  return updated;
};

// Lấy danh sách bài tập của một lớp
// Sao chép bài tập từ lớp này sang lớp khác
export const shareAssignments = async (sourceClassId, targetClassIds, assignmentIds, teacherId) => {
  // Kiểm tra quyền sở hữu lớp nguồn
  const { data: sourceClass } = await supabase
    .from('classes').select('id, teacher_id').eq('id', sourceClassId).single();
  if (!sourceClass || sourceClass.teacher_id !== teacherId) {
    throw new Error('Bạn không phải giáo viên của lớp nguồn');
  }

  // Kiểm tra quyền sở hữu các lớp đích
  const { data: targetClasses } = await supabase
    .from('classes').select('id, teacher_id').in('id', targetClassIds);
  if (!targetClasses || targetClasses.length !== targetClassIds.length) {
    throw new Error('Một số lớp đích không tồn tại');
  }
  for (const tc of targetClasses) {
    if (tc.teacher_id !== teacherId) {
      throw new Error('Bạn không phải giáo viên của lớp ' + tc.id);
    }
  }

  // Lấy bài tập kèm test cases từ lớp nguồn
  let query = supabase
    .from('assignments')
    .select('*, test_cases(*)')
    .eq('class_id', sourceClassId);

  if (assignmentIds && assignmentIds.length > 0) {
    query = query.in('id', assignmentIds);
  }

  const { data: assignments } = await query;

  if (!assignments || assignments.length === 0) {
    throw new Error('Không có bài tập nào để sao chép');
  }

  let copiedCount = 0;
  for (const targetClassId of targetClassIds) {
    for (const a of assignments) {
      const { test_cases, id, class_id, is_published, created_at, ...assignData } = a;
      const { data: newAssign, error } = await supabase
        .from('assignments')
        .insert([{ ...assignData, class_id: targetClassId, is_published: false }])
        .select('id')
        .single();

      if (error) continue;

      // Copy test cases
      if (test_cases && test_cases.length > 0) {
        const newTestCases = test_cases.map((tc, idx) => ({
          assignment_id: newAssign.id,
          input_data: tc.input_data || '',
          expected_output: tc.expected_output || '',
          test_name: tc.test_name || `Test ${idx + 1}`,
          points: tc.points || 1,
          order_index: tc.order_index || idx,
        }));
        const { error: tcError } = await supabase.from('test_cases').insert(newTestCases);
        if (!tcError) {
          // Cập nhật max_score = tổng points
          const totalPoints = newTestCases.reduce((s, t) => s + t.points, 0);
          await supabase.from('assignments').update({ max_score: totalPoints }).eq('id', newAssign.id);
        }
      }
      copiedCount++;
    }
  }

  return { copied: copiedCount, targetCount: targetClassIds.length };
};

export const getClassAssignments = async (classId, userId, role) => {
  // Kiểm tra quyền truy cập lớp
  if (role === 'teacher') {
    const { data: classData } = await supabase
      .from('classes')
      .select('id')
      .eq('id', classId)
      .eq('teacher_id', userId)
      .single();

    if (!classData) {
      throw new Error('Bạn không phải giáo viên của lớp này');
    }
  } else {
    // Student: kiểm tra đã enroll
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', userId)
      .eq('class_id', classId)
      .single();

    if (!enrollment) {
      throw new Error('Bạn chưa tham gia lớp này');
    }
  }

  let query = supabase
    .from('assignments')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false });

  // Student chỉ thấy bài đã publish
  if (role === 'student') {
    query = query.eq('is_published', true);
  }

  const { data: assignments, error } = await query;

  if (error) {
    throw new Error('Lấy danh sách bài tập thất bại');
  }

  return assignments;
};
