import { supabase } from './supabaseClient.js';
import {
  copyAssignmentsIndependently,
  normalizeIds,
  validateShareRequest,
} from './assignmentSharing.js';

const markAssignmentDeliveriesForRegrade = async (assignmentId, teacherId) => {
  const { data: deliveries, error } = await supabase
    .from('assignment_deliveries')
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('teacher_id', teacherId);
  if (error) throw new Error('Không thể cập nhật trạng thái chấm lại.');
  const deliveryIds = (deliveries ?? []).map((delivery) => delivery.id);
  if (deliveryIds.length === 0) return;
  const { error: updateError } = await supabase
    .from('submissions')
    .update({ regrade_status: 'required', regrade_error: null })
    .in('delivery_id', deliveryIds);
  if (updateError) throw new Error('Không thể đánh dấu bài nộp cần chấm lại.');
};

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
    .select('id, class_id, content_version, classes!inner(teacher_id)')
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
  const scoringChanged = ['starter_code', 'solution_code', 'test_code', 'setup_sql', 'max_score']
    .some((field) => data[field] !== undefined);
  if (scoringChanged) {
    updates.content_version = Number(assignment.content_version ?? 1) + 1;
    updates.updated_at = new Date().toISOString();
  }

  const { data: updated, error } = await supabase
    .from('assignments')
    .update(updates)
    .eq('id', assignmentId)
    .select('*')
    .single();

  if (error) throw new Error('Cập nhật bài tập thất bại: ' + error.message);
  if (scoringChanged) await markAssignmentDeliveriesForRegrade(assignmentId, teacherId);
  return updated;
};

// Thêm / cập nhật test cases cho bài tập
export const upsertTestCases = async (assignmentId, testCases, teacherId) => {
  // Kiểm tra quyền sở hữu
  const { data: assignment, error: assignError } = await supabase
    .from('assignments')
    .select('id, class_id, content_version, classes!inner(teacher_id)')
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
    .update({
      max_score,
      content_version: Number(assignment.content_version ?? 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignmentId);

  await markAssignmentDeliveriesForRegrade(assignmentId, teacherId);

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

  const { data: assignment, error } = await query.single();

  if (error || !assignment) {
    throw new Error('Không tìm thấy bài tập');
  }

  // Ẩn solution_code với student
  if (role === 'student') {
    const { data: deliveries } = await supabase
      .from('assignment_deliveries')
      .select('id,class_id,is_published,recipient_mode,assignment_recipients(user_id)')
      .eq('assignment_id', assignmentId)
      .eq('is_published', true);
    const classIds = (deliveries ?? []).map((delivery) => delivery.class_id);
    const { data: enrollments } = classIds.length > 0
      ? await supabase
        .from('enrollments')
        .select('class_id')
        .eq('user_id', userId)
        .in('class_id', classIds)
      : { data: [] };
    const enrolledClassIds = new Set((enrollments ?? []).map((row) => row.class_id));
    const authorized = (deliveries ?? []).some((delivery) => enrolledClassIds.has(delivery.class_id)
      && (delivery.recipient_mode === 'all'
        || delivery.assignment_recipients?.some((row) => row.user_id === userId)));
    if (!authorized) throw new Error('Bạn không được chỉ định làm bài tập này.');
    delete assignment.solution_code;
  } else if ((assignment.teacher_id || assignment.classes?.teacher_id) !== userId) {
    throw new Error('Bạn không có quyền xem bài tập này.');
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

// Sao chép bài tập thành các bản nháp độc lập ở lớp cùng khối.
export const createShareAssignmentsService = (supabaseClient) => async (
  sourceClassId,
  targetClassIds,
  assignmentIds,
  teacherId
) => {
  const normalizedTargetIds = normalizeIds(targetClassIds);
  const normalizedAssignmentIds = normalizeIds(assignmentIds);

  const { data: sourceClass, error: sourceError } = await supabaseClient
    .from('classes')
    .select('id, teacher_id, grade')
    .eq('id', sourceClassId)
    .single();

  if (sourceError || !sourceClass) {
    throw new Error('Không tìm thấy lớp nguồn');
  }

  const { data: targetClasses, error: targetError } = await supabaseClient
    .from('classes')
    .select('id, teacher_id, grade')
    .in('id', normalizedTargetIds);

  if (targetError) {
    throw new Error('Lấy danh sách lớp đích thất bại');
  }

  const { data: assignments, error: assignmentError } = await supabaseClient
    .from('assignments')
    .select('*, test_cases(*)')
    .eq('class_id', sourceClassId)
    .in('id', normalizedAssignmentIds);

  if (assignmentError) {
    throw new Error('Lấy danh sách bài tập thất bại');
  }

  validateShareRequest({
    sourceClass,
    targetClasses: targetClasses || [],
    targetClassIds: normalizedTargetIds,
    assignments: assignments || [],
    assignmentIds: normalizedAssignmentIds,
    teacherId,
  });

  const repository = {
    async createAssignment(data) {
      const { data: created, error } = await supabaseClient
        .from('assignments')
        .insert([data])
        .select('id')
        .single();
      if (error || !created) {
        throw new Error(error?.message || 'Tạo bản sao bài tập thất bại');
      }
      return created;
    },
    async createTestCases(rows) {
      const { error } = await supabaseClient.from('test_cases').insert(rows);
      if (error) {
        throw new Error(error.message || 'Sao chép test case thất bại');
      }
    },
    async updateAssignmentMaxScore(assignmentId, maxScore) {
      const { error } = await supabaseClient
        .from('assignments')
        .update({ max_score: maxScore })
        .eq('id', assignmentId);
      if (error) {
        throw new Error(error.message || 'Cập nhật điểm bài tập thất bại');
      }
    },
    async deleteAssignment(assignmentId) {
      const { error } = await supabaseClient
        .from('assignments')
        .delete()
        .eq('id', assignmentId);
      if (error) {
        throw new Error(error.message || 'Dọn bản sao chưa hoàn chỉnh thất bại');
      }
    },
  };

  return copyAssignmentsIndependently({
    targetClassIds: normalizedTargetIds,
    assignments: assignments || [],
    repository,
  });
};

export const shareAssignments = createShareAssignmentsService(supabase);

export const canStudentSeeDelivery = (delivery, userId) =>
  Boolean(delivery.is_published)
  && (delivery.recipient_mode === 'all'
    || (delivery.assignment_recipients ?? []).some((row) => row.user_id === userId));

export const flattenDeliveryAssignment = (delivery) => ({
  ...delivery.assignments,
  id: delivery.assignment_id,
  assignment_id: delivery.assignment_id,
  library_assignment_id: delivery.library_assignment_id,
  delivery_id: delivery.id,
  class_id: delivery.class_id,
  due_date: delivery.due_date,
  is_published: delivery.is_published,
  max_submissions: delivery.max_submissions,
  sync_mode: delivery.sync_mode,
  recipient_mode: delivery.recipient_mode,
});

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

  const query = supabase
    .from('assignment_deliveries')
    .select('*, assignments:assignment_id(*), assignment_recipients(user_id)')
    .eq('class_id', classId)
    .order('created_at', { ascending: false });

  const { data: deliveries, error } = await query;

  if (error) {
    throw new Error('Lấy danh sách bài tập thất bại');
  }

  return (deliveries ?? [])
    .filter((delivery) => role === 'teacher' || canStudentSeeDelivery(delivery, userId))
    .map(flattenDeliveryAssignment);
};
