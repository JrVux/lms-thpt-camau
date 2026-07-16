import { supabase } from './supabaseClient.js';

// Subject mapping theo grade
const SUBJECT_BY_GRADE = { 10: 'python', 11: 'sql', 12: 'html' };

// Kiểm tra giới hạn: 1 học sinh tối đa 2 lớp, phải cùng khối
const checkEnrollmentLimit = async (userId, newClassId) => {
  // Lấy grade của lớp mới
  const { data: newClass } = await supabase
    .from('classes').select('grade').eq('id', newClassId).single();
  if (!newClass) throw new Error('Không tìm thấy lớp');

  // Lấy các lớp hiện tại của học sinh
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('class_id, classes(grade)')
    .eq('user_id', userId);

  const currentClasses = enrollments || [];

  if (currentClasses.length >= 2) {
    throw new Error('Học sinh chỉ được tham gia tối đa 2 lớp');
  }

  if (currentClasses.length === 1) {
    const existingGrade = currentClasses[0].classes?.grade;
    if (existingGrade && existingGrade !== newClass.grade) {
      throw new Error(`Học sinh đang học khối ${existingGrade}, không thể tham gia lớp khối ${newClass.grade}`);
    }
  }
};

// Tự sinh mã lớp 6 ký tự viết hoa (ví dụ: AB3X9K)
const generateClassCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Tạo lớp mới (chỉ teacher)
export const createClass = async (data, teacherId) => {
  const { name, grade } = data;

  if (!['10', '11', '12'].includes(grade)) {
    throw new Error('Khối lớp phải là 10, 11 hoặc 12');
  }

  const subject = SUBJECT_BY_GRADE[parseInt(grade)];

  // Sinh class_code duy nhất
  let class_code;
  let isUnique = false;
  while (!isUnique) {
    class_code = generateClassCode();
    const { data: existing } = await supabase
      .from('classes')
      .select('id')
      .eq('class_code', class_code)
      .single();
    if (!existing) isUnique = true;
  }

  const { data: newClass, error } = await supabase
    .from('classes')
    .insert([{ name, grade, subject, class_code, teacher_id: teacherId }])
    .select('*')
    .single();

  if (error) {
    throw new Error('Tạo lớp thất bại: ' + error.message);
  }

  return newClass;
};

// Lấy danh sách lớp (theo role)
export const getClasses = async (userId, role) => {
  if (role === 'teacher') {
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Lấy danh sách lớp thất bại');
    return data;
  }

  // Student: lấy lớp đã join qua enrollments
  const { data, error } = await supabase
    .from('enrollments')
    .select('classes(*)')
    .eq('user_id', userId);

  if (error) throw new Error('Lấy danh sách lớp thất bại');
  return data.map((e) => e.classes);
};

// Tham gia lớp bằng mã lớp
export const joinClass = async (classCode, userId) => {
  // Tìm lớp theo class_code
  const { data: classData, error: classError } = await supabase
    .from('classes')
    .select('id, grade')
    .eq('class_code', classCode)
    .single();

  if (classError || !classData) {
    throw new Error('Không tìm thấy lớp với mã này');
  }

  // Kiểm tra đã tham gia chưa
  const { data: existingEnrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('user_id', userId)
    .eq('class_id', classData.id)
    .single();

  if (existingEnrollment) {
    throw new Error('Bạn đã tham gia lớp này rồi');
  }

  // Kiểm tra giới hạn số lớp
  await checkEnrollmentLimit(userId, classData.id);

  const { data: enrollment, error } = await supabase
    .from('enrollments')
    .insert([{ user_id: userId, class_id: classData.id }])
    .select('*')
    .single();

  if (error) {
    throw new Error('Tham gia lớp thất bại: ' + error.message);
  }

  return enrollment;
};

// Lấy danh sách học sinh trong lớp (chỉ teacher)
export const getStudents = async (classId, teacherId) => {
  // Kiểm tra quyền sở hữu lớp
  const { data: classData, error: classError } = await supabase
    .from('classes')
    .select('id, teacher_id')
    .eq('id', classId)
    .single();

  if (classError || !classData) {
    throw new Error('Không tìm thấy lớp');
  }

  if (classData.teacher_id !== teacherId) {
    throw new Error('Bạn không phải giáo viên của lớp này');
  }

  // Lấy danh sách học sinh
  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      user_id,
      enrolled_at,
      users (id, username, email, full_name)
    `)
    .eq('class_id', classId);

  if (error) {
    throw new Error('Lấy danh sách học sinh thất bại: ' + error.message);
  }

  // Đếm số bài nộp của từng học sinh
  const studentIds = data.map((e) => e.user_id);
  let submissionCounts = {};
  if (studentIds.length > 0) {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id')
      .eq('class_id', classId);
    const assignmentIds = assignments?.map((a) => a.id) || [];
    if (assignmentIds.length > 0) {
      const { data: subs } = await supabase
        .from('submissions')
        .select('user_id')
        .in('user_id', studentIds)
        .in('assignment_id', assignmentIds);
      for (const s of subs || []) {
        submissionCounts[s.user_id] = (submissionCounts[s.user_id] || 0) + 1;
      }
    }
  }

  return data.map((e) => ({
    user_id: e.user_id,
    full_name: e.users?.full_name || '',
    username: e.users?.username || '',
    email: e.users?.email || '',
    enrolled_at: e.enrolled_at,
    submission_count: submissionCounts[e.user_id] || 0,
  })).sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'));
};

// Thêm học sinh vào lớp (tạo user mới + enroll)
export const addStudent = async (classId, teacherId, { username, email, password, full_name }) => {
  const { data: classData } = await supabase
    .from('classes').select('id, teacher_id').eq('id', classId).single();
  if (!classData || classData.teacher_id !== teacherId) throw new Error('Bạn không phải giáo viên của lớp này');

  if (!username || !password || !full_name) {
    throw new Error('Vui lòng nhập đầy đủ thông tin (username, password, full_name)');
  }

  if (!email) email = `${username}@lms.local`;

  // Kiểm tra username/email đã tồn tại chưa
  const { data: existing } = await supabase
    .from('users').select('id').or(`username.eq.${username},email.eq.${email}`).maybeSingle();
  if (existing) throw new Error('Username hoặc email đã tồn tại');

  const bcrypt = (await import('bcrypt')).default;
  const password_hash = await bcrypt.hash(password, 10);

  const { data: newUser, error: createError } = await supabase
    .from('users').insert([{ username, email, password_hash, full_name, role: 'student' }]).select('id').single();
  if (createError) throw new Error('Tạo tài khoản thất bại');

  const { error: enrollError } = await supabase
    .from('enrollments').insert([{ user_id: newUser.id, class_id: classId }]);
  if (enrollError) throw new Error('Thêm học sinh vào lớp thất bại');

  return { user_id: newUser.id, full_name, username, email };
};

// Cập nhật thông tin học sinh
export const updateStudent = async (classId, teacherId, userId, { full_name, email, username }) => {
  const { data: classData } = await supabase
    .from('classes').select('id, teacher_id').eq('id', classId).single();
  if (!classData || classData.teacher_id !== teacherId) throw new Error('Bạn không phải giáo viên của lớp này');

  const { error } = await supabase
    .from('users').update({ full_name, email, username }).eq('id', userId);
  if (error) throw new Error('Cập nhật thất bại');
  return { user_id: userId, full_name, email, username };
};

// Xóa học sinh khỏi lớp (giữ tài khoản)
export const removeStudent = async (classId, teacherId, userId) => {
  const { data: classData } = await supabase
    .from('classes').select('id, teacher_id').eq('id', classId).single();
  if (!classData || classData.teacher_id !== teacherId) throw new Error('Bạn không phải giáo viên của lớp này');

  const { error } = await supabase
    .from('enrollments').delete().eq('user_id', userId).eq('class_id', classId);
  if (error) throw new Error('Xóa học sinh thất bại');
};

// Reset mật khẩu học sinh
export const resetStudentPassword = async (classId, teacherId, userId, newPassword) => {
  const { data: classData } = await supabase
    .from('classes').select('id, teacher_id').eq('id', classId).single();
  if (!classData || classData.teacher_id !== teacherId) throw new Error('Bạn không phải giáo viên của lớp này');

  if (!newPassword || newPassword.length < 6) throw new Error('Mật khẩu phải có ít nhất 6 ký tự');

  const bcrypt = (await import('bcrypt')).default;
  const password_hash = await bcrypt.hash(newPassword, 10);

  const { error } = await supabase
    .from('users').update({ password_hash }).eq('id', userId);
  if (error) throw new Error('Reset mật khẩu thất bại');
};

// Import nhiều học sinh từ mảng [{ username, email, password, full_name }]
export const bulkImportStudents = async (classId, teacherId, students) => {
  const { data: classData } = await supabase
    .from('classes').select('id, teacher_id').eq('id', classId).single();
  if (!classData || classData.teacher_id !== teacherId) throw new Error('Bạn không phải giáo viên của lớp này');

  if (!students || !Array.isArray(students) || students.length === 0) {
    throw new Error('Danh sách học sinh trống');
  }

  const bcrypt = (await import('bcrypt')).default;
  const results = { success: 0, errors: [] };

  for (const s of students) {
    if (!s.username || !s.password || !s.full_name) {
      results.errors.push({ row: s, error: 'Thiếu thông tin' });
      continue;
    }
    if (!s.email) s.email = `${s.username}@lms.local`;
    try {
      const { data: existing } = await supabase
        .from('users').select('id').or(`username.eq.${s.username},email.eq.${s.email}`).maybeSingle();
      if (existing) {
        results.errors.push({ row: s, error: 'Username hoặc email đã tồn tại' });
        continue;
      }
      const password_hash = await bcrypt.hash(s.password, 10);
      const { data: newUser, error: createError } = await supabase
        .from('users').insert([{ username: s.username, email: s.email, password_hash, full_name: s.full_name, role: 'student' }]).select('id').single();
      if (createError) throw new Error(createError.message);
      const { error: enrollError } = await supabase
        .from('enrollments').insert([{ user_id: newUser.id, class_id: classId }]);
      if (enrollError) throw new Error(enrollError.message);
      results.success++;
    } catch (e) {
      results.errors.push({ row: s, error: e.message });
    }
  }

  return results;
};

// Tìm kiếm học sinh theo tên hoặc username (cho teacher)
export const searchStudents = async (teacherId, query) => {
  if (!query || query.trim().length < 2) throw new Error('Nhập ít nhất 2 ký tự để tìm');

  const { data: byName, error: err1 } = await supabase
    .from('users')
    .select('id, username, full_name, email')
    .eq('role', 'student')
    .ilike('full_name', `%${query}%`)
    .limit(20);

  const { data: byUsername, error: err2 } = await supabase
    .from('users')
    .select('id, username, full_name, email')
    .eq('role', 'student')
    .ilike('username', `%${query}%`)
    .limit(20);

  if (err1 && err2) throw new Error('Tìm kiếm thất bại');

  // Gộp kết quả, loại trùng
  const map = new Map();
  for (const s of [...(byName || []), ...(byUsername || [])]) {
    map.set(s.id, s);
  }
  return Array.from(map.values());
};

// Ghi danh học sinh đã có tài khoản vào lớp
export const enrollExistingStudent = async (classId, teacherId, userId) => {
  const { data: classData } = await supabase
    .from('classes').select('id, teacher_id').eq('id', classId).single();
  if (!classData || classData.teacher_id !== teacherId) throw new Error('Bạn không phải giáo viên của lớp này');

  const { data: existing } = await supabase
    .from('enrollments').select('id').eq('user_id', userId).eq('class_id', classId).maybeSingle();
  if (existing) throw new Error('Học sinh đã ở trong lớp này');

  const { data: user } = await supabase
    .from('users').select('id, full_name, username').eq('id', userId).eq('role', 'student').single();
  if (!user) throw new Error('Không tìm thấy học sinh');

  // Kiểm tra giới hạn số lớp
  await checkEnrollmentLimit(userId, classId);

  const { error } = await supabase
    .from('enrollments').insert([{ user_id: userId, class_id: classId }]);
  if (error) throw new Error('Ghi danh thất bại');

  return user;
};

// Lấy học sinh chưa thuộc lớp nào
export const getUnassignedStudents = async () => {
  // Lấy tất cả student
  const { data: allStudents, error: err1 } = await supabase
    .from('users')
    .select('id, username, full_name, email, created_at')
    .eq('role', 'student')
    .order('full_name');

  if (err1) throw new Error('Không thể lấy danh sách học sinh');

  // Lấy user_id đã có enrollment
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('user_id');

  const enrolledIds = new Set((enrollments || []).map((e) => e.user_id));
  return (allStudents || []).filter((s) => !enrolledIds.has(s.id));
};

// Xóa tài khoản học sinh
export const deleteStudentAccount = async (teacherId, userId) => {
  const { data: user } = await supabase
    .from('users').select('id, role').eq('id', userId).single();
  if (!user || user.role !== 'student') throw new Error('Không tìm thấy học sinh');

  // Xóa enrollments trước
  await supabase.from('enrollments').delete().eq('user_id', userId);
  // Xóa submissions
  await supabase.from('submissions').delete().eq('user_id', userId);
  // Xóa user
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw new Error('Xóa tài khoản thất bại');
};
