import { supabase } from './supabaseClient.js';

export const getTeacherStats = async (userId) => {
  const { data: classes } = await supabase
    .from('classes')
    .select('id, grade')
    .eq('teacher_id', userId);

  if (!classes) return { total_classes: 0, assignments_by_grade: { 10: 0, 11: 0, 12: 0 } };

  const classIds = classes.map((c) => c.id);
  const gradeMap = {};
  for (const c of classes) {
    gradeMap[c.id] = c.grade;
  }

  let assignmentsByGrade = { 10: 0, 11: 0, 12: 0 };
  if (classIds.length > 0) {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, class_id')
      .in('class_id', classIds);

    if (assignments) {
      for (const a of assignments) {
        const g = gradeMap[a.class_id];
        if (g && assignmentsByGrade[g] !== undefined) {
          assignmentsByGrade[g]++;
        }
      }
    }
  }

  const totalAssignments = Object.values(assignmentsByGrade).reduce((s, v) => s + v, 0);

  return {
    total_classes: classes.length,
    total_assignments: totalAssignments,
    assignments_by_grade: assignmentsByGrade,
  };
};

export const getStudentStats = async (userId) => {
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('class_id')
    .eq('user_id', userId);

  const classIds = (enrollments || []).map((e) => e.class_id);
  const totalClasses = classIds.length;

  let totalAssignments = 0;
  let completedAssignments = 0;

  if (classIds.length > 0) {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id')
      .in('class_id', classIds)
      .eq('is_published', true);

    const assignmentIds = (assignments || []).map((a) => a.id);
    totalAssignments = assignmentIds.length;

    if (assignmentIds.length > 0) {
      const { count } = await supabase
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('assignment_id', assignmentIds);

      completedAssignments = count || 0;
    }
  }

  return { total_classes: totalClasses, total_assignments: totalAssignments, completed_assignments: completedAssignments };
};