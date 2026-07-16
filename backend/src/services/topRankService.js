import { supabase } from './supabaseClient.js';

export const getTopRank = async () => {
  const grades = ['10', '11', '12'];
  const result = {};

  for (const grade of grades) {
    // Lấy tất cả lớp của khối
    const { data: classes } = await supabase
      .from('classes')
      .select('id')
      .eq('grade', grade);

    if (!classes || classes.length === 0) {
      result[grade] = [];
      continue;
    }

    const classIds = classes.map((c) => c.id);

    // Lấy tất cả học sinh trong các lớp này
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('user_id, users!inner(full_name)')
      .in('class_id', classIds);

    if (!enrollments || enrollments.length === 0) {
      result[grade] = [];
      continue;
    }

    const studentMap = {};
    for (const e of enrollments) {
      studentMap[e.user_id] = { name: e.users.full_name, totalScore: 0, totalMaxScore: 0 };
    }

    // Lấy tất cả bài tập của khối
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id')
      .in('class_id', classIds)
      .eq('is_published', true);

    if (!assignments || assignments.length === 0) {
      result[grade] = [];
      continue;
    }

    const assignmentIds = assignments.map((a) => a.id);

    // Lấy tất cả submissions
    const { data: submissions } = await supabase
      .from('submissions')
      .select('user_id, assignment_id, score, max_score')
      .in('assignment_id', assignmentIds)
      .in('user_id', Object.keys(studentMap))
      .order('submitted_at', { ascending: false });

    // Chỉ lấy bài nộp mới nhất mỗi học sinh × bài tập
    const bestScores = {};
    if (submissions) {
      for (const sub of submissions) {
        const key = `${sub.user_id}_${sub.assignment_id}`;
        if (!bestScores[key]) {
          bestScores[key] = { score: sub.score, max_score: sub.max_score };
        }
      }
    }

    // Tính tổng điểm
    for (const key of Object.keys(bestScores)) {
      const [userId] = key.split('_');
      if (studentMap[userId]) {
        studentMap[userId].totalScore += bestScores[key].score;
        studentMap[userId].totalMaxScore += bestScores[key].max_score;
      }
    }

    // Sắp xếp và lấy top 3
    const sorted = Object.entries(studentMap)
      .map(([userId, s]) => ({ userId, ...s }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 3);

    result[grade] = sorted;
  }

  return result;
};