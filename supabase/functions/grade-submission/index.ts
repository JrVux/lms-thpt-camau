import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, functionError } from '../_shared/http.ts';
import { verifyAppJwt } from '../_shared/appJwt.ts';
import { authorizeTeacherSubmission } from '../_shared/authorization.ts';
import { validateScore } from '../_shared/fileRules.ts';

const safeSubmission = (sub: any) => {
  if (!sub) return null;
  const { ['object_key']: _key, ...safe } = sub;
  return safe;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ phương thức POST' } }, 405);
  }

  try {
    const jwtSecret = Deno.env.get('APP_JWT_SECRET') || Deno.env.get('JWT_SECRET') || '';
    const claims = await verifyAppJwt(req.headers.get('Authorization'), jwtSecret);
    if (claims.role !== 'teacher') {
      throw { code: 'FORBIDDEN', message: 'Chỉ giáo viên mới có quyền chấm bài.', status: 403 };
    }

    const body = await req.json();
    const { submissionId, score, feedback } = body;

    if (!submissionId || score === undefined || score === null) {
      throw { code: 'MISSING_GRADING_INFO', message: 'Thiếu thông tin bài nộp hoặc điểm số.', status: 400 };
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceRoleKey);

    const { assignment } = await authorizeTeacherSubmission(db, claims.id, submissionId);

    const numScore = Number(score);
    const scoreErr = validateScore(numScore, assignment.max_score ?? 10);
    if (scoreErr) throw scoreErr;

    const normalizedFeedback = String(feedback ?? '').trim().slice(0, 5000);

    const { data: updatedSub, error: updateErr } = await db
      .from('submissions')
      .update({
        score: numScore,
        feedback: normalizedFeedback || null,
        graded_at: new Date().toISOString(),
        graded_by: claims.id,
        status: 'graded',
      })
      .eq('id', submissionId)
      .select()
      .single();

    if (updateErr || !updatedSub) {
      throw { code: 'UPDATE_FAILED', message: updateErr?.message || 'Cập nhật điểm thất bại.', status: 500 };
    }

    return json({
      success: true,
      submission: safeSubmission(updatedSub),
    });
  } catch (err) {
    return functionError(err, 'grade-submission');
  }
});
