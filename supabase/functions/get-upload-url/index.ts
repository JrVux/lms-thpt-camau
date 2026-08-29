import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, functionError } from '../_shared/http.ts';
import { verifyAppJwt, signUploadToken } from '../_shared/appJwt.ts';
import { authorizeStudentDelivery } from '../_shared/authorization.ts';
import { safeFileName, deadlineState, validateFile } from '../_shared/fileRules.ts';
import { presignPut } from '../_shared/r2.ts';

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
    if (claims.role !== 'student') {
      throw { code: 'FORBIDDEN', message: 'Chỉ học sinh mới có quyền nộp bài.', status: 403 };
    }

    const body = await req.json();
    const { deliveryId, fileName, mimeType, fileSize } = body;

    if (!deliveryId || !fileName || !mimeType || !fileSize) {
      throw { code: 'MISSING_FILE_INFO', message: 'Thiếu thông tin file hoặc bài tập.', status: 400 };
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceRoleKey);

    const { delivery, assignment } = await authorizeStudentDelivery(db, claims.id, deliveryId);

    const fileErr = validateFile({ mimeType, fileSize: Number(fileSize) }, assignment);
    if (fileErr) throw fileErr;

    const deadlineInfo = deadlineState(delivery.due_date, assignment.allow_late_submission);
    if (!deadlineInfo.allowed) {
      throw { code: 'DEADLINE_PASSED', message: 'Bài tập đã quá hạn nộp và không cho phép nộp trễ.', status: 400 };
    }

    if (delivery.max_submissions !== null) {
      const { count, error: countErr } = await db
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('delivery_id', deliveryId)
        .eq('user_id', claims.id)
        .not('object_key', 'is', null);

      if (!countErr && count !== null && count >= delivery.max_submissions) {
        throw { code: 'MAX_SUBMISSIONS_EXCEEDED', message: `Bạn đã nộp tối đa ${delivery.max_submissions} lần cho phép.`, status: 400 };
      }
    }

    const sanitized = safeFileName(fileName);
    if (!sanitized) {
      throw { code: 'INVALID_FILE_NAME', message: 'Tên file không hợp lệ.', status: 400 };
    }

    const objectKey = `${deliveryId}/${claims.id}/${Date.now()}_${crypto.randomUUID()}_${sanitized}`;
    const uploadUrl = await presignPut(objectKey, mimeType);

    const uploadToken = await signUploadToken(
      {
        deliveryId,
        studentId: claims.id,
        objectKey,
        fileName: sanitized,
        mimeType,
        fileSize: Number(fileSize),
      },
      jwtSecret
    );

    return json({
      uploadUrl,
      uploadToken,
      expiresIn: 300,
    });
  } catch (err) {
    return functionError(err, 'get-upload-url');
  }
});
