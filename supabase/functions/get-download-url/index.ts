import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, functionError } from '../_shared/http.ts';
import { verifyAppJwt } from '../_shared/appJwt.ts';
import { authorizeStudentDelivery, authorizeTeacherSubmission } from '../_shared/authorization.ts';
import { presignGet } from '../_shared/r2.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ phương thức GET hoặc POST' } }, 405);
  }

  try {
    const jwtSecret = Deno.env.get('APP_JWT_SECRET') || Deno.env.get('JWT_SECRET') || '';
    const claims = await verifyAppJwt(req.headers.get('Authorization'), jwtSecret);

    let submissionId = '';
    if (req.method === 'POST') {
      const body = await req.json();
      submissionId = body.submissionId || '';
    } else {
      const url = new URL(req.url);
      submissionId = url.searchParams.get('submissionId') || '';
    }

    if (!submissionId) {
      throw { code: 'MISSING_SUBMISSION_ID', message: 'Thiếu mã bài nộp (submissionId).', status: 400 };
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceRoleKey);

    let targetSubmission: any = null;

    if (claims.role === 'student') {
      const { data: sub, error: subErr } = await db
        .from('submissions')
        .select('*')
        .eq('id', submissionId)
        .eq('user_id', claims.id)
        .single();

      if (subErr || !sub) {
        throw { code: 'NOT_FOUND', message: 'Không tìm thấy bài nộp.', status: 404 };
      }

      await authorizeStudentDelivery(db, claims.id, sub.delivery_id);
      targetSubmission = sub;
    } else if (claims.role === 'teacher') {
      const authorized = await authorizeTeacherSubmission(db, claims.id, submissionId);
      targetSubmission = authorized.submission;
    } else {
      throw { code: 'FORBIDDEN', message: 'Quyền sử dụng không hợp lệ.', status: 403 };
    }

    if (!targetSubmission.object_key) {
      throw { code: 'NOT_A_FILE_SUBMISSION', message: 'Bài nộp này không có file đính kèm.', status: 400 };
    }

    const downloadUrl = await presignGet(targetSubmission.object_key);

    return json({
      downloadUrl,
      expiresIn: 900,
      file: {
        fileName: targetSubmission.file_name,
        mimeType: targetSubmission.mime_type,
        fileSize: targetSubmission.file_size,
      },
    });
  } catch (err) {
    return functionError(err, 'get-download-url');
  }
});
