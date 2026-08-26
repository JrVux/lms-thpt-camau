import { supabase } from './supabaseClient.js';

export const globalSearch = async ({ userId, role, query }) => {
  const q = String(query || '').trim();
  if (!q || q.length < 1) return { classes: [], assignments: [], topics: [], students: [] };

  const results = {
    classes: [],
    assignments: [],
    topics: [],
    students: [],
  };

  if (role === 'teacher') {
    // 1. Tìm lớp học
    const { data: classes } = await supabase
      .from('classes')
      .select('id, name, grade, class_code')
      .eq('teacher_id', userId)
      .ilike('name', `%${q}%`)
      .limit(5);

    results.classes = (classes || []).map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: `Khối ${c.grade} · Mã: ${c.class_code}`,
      type: 'class',
      path: `/classes/${c.id}`,
    }));

    // 2. Tìm bài tập
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, title, is_library, class_id, category, type')
      .eq('teacher_id', userId)
      .ilike('title', `%${q}%`)
      .limit(5);

    results.assignments = (assignments || []).map((a) => ({
      id: a.id,
      title: a.title,
      subtitle: a.is_library ? `Kho bài tập (${a.type.toUpperCase()})` : `Bài tập lớp`,
      type: 'assignment',
      path: a.is_library ? `/assignments?category=${a.category}` : `/classes/${a.class_id}`,
    }));

    // 3. Tìm chủ đề bài tập
    const { data: topics } = await supabase
      .from('assignment_topics')
      .select('id, name, category')
      .eq('teacher_id', userId)
      .ilike('name', `%${q}%`)
      .limit(5);

    results.topics = (topics || []).map((t) => ({
      id: t.id,
      title: t.name,
      subtitle: `Chủ đề · ${t.category === 'advanced' ? 'Nâng cao' : 'Khối ' + t.category.replace('grade_', '')}`,
      type: 'topic',
      path: `/assignments?topicId=${t.id}&category=${t.category}`,
    }));

    // 4. Tìm học sinh trong các lớp của giáo viên
    const { data: teacherClasses } = await supabase
      .from('classes')
      .select('id, name')
      .eq('teacher_id', userId);

    const classIds = (teacherClasses || []).map((c) => c.id);
    const classNameMap = new Map((teacherClasses || []).map((c) => [c.id, c.name]));

    if (classIds.length > 0) {
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('class_id, users!inner(id, full_name, username, email, role)')
        .in('class_id', classIds)
        .eq('users.role', 'student')
        .or(`full_name.ilike.%${q}%,username.ilike.%${q}%,email.ilike.%${q}%`, { foreignTable: 'users' })
        .limit(10);

      const seenStudents = new Set();
      const studentResults = [];

      for (const e of enrollments || []) {
        const student = e.users;
        if (!student || seenStudents.has(student.id)) continue;
        seenStudents.add(student.id);
        const className = classNameMap.get(e.class_id) || 'Lớp';
        studentResults.push({
          id: student.id,
          title: student.full_name || student.username,
          subtitle: `Học sinh · Lớp ${className}`,
          type: 'student',
          path: `/classes/${e.class_id}?studentId=${student.id}`,
        });
      }
      results.students = studentResults.slice(0, 5);
    }
  } else {
    // Role học sinh
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('classes!inner(id, name, grade)')
      .eq('user_id', userId)
      .ilike('classes.name', `%${q}%`)
      .limit(5);

    results.classes = (enrollments || []).map((e) => ({
      id: e.classes.id,
      title: e.classes.name,
      subtitle: `Khối ${e.classes.grade}`,
      type: 'class',
      path: `/classes/${e.classes.id}`,
    }));

    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, title, type, class_id')
      .ilike('title', `%${q}%`)
      .limit(5);

    results.assignments = (assignments || []).map((a) => ({
      id: a.id,
      title: a.title,
      subtitle: `Bài tập · ${a.type.toUpperCase()}`,
      type: 'assignment',
      path: `/assignments`,
    }));
  }

  return results;
};
