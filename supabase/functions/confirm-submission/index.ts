import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, functionError } from '../_shared/http.ts';
import { verifyAppJwt, verifyUploadToken } from '../_shared/appJwt.ts';
import { authorizeStudentDelivery } from '../_shared/authorization.ts';
import { deadlineState } from '../_shared/fileRules.ts';
import { headObject } from '../_shared/r2.ts';

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

    const body = await req.json();
    const { uploadToken } = body;
    if (!uploadToken) {
      throw { code: 'MISSING_UPLOAD_TOKEN', message: 'Thiếu upload token xác nhận.', status: 400 };
    }

    const tokenData = await verifyUploadToken(uploadToken, jwtSecret);
    if (tokenData.studentId !== claims.id) {
      throw { code: 'FORBIDDEN', message: 'Upload token không thuộc về người dùng hiện tại.', status: 403 };
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceRoleKey);

    const { delivery, assignment } = await authorizeStudentDelivery(db, claims.id, tokenData.deliveryId);

    const deadlineInfo = deadlineState(delivery.due_date, assignment.allow_late_submission);

    // Verify object exists in R2 object storage
    const head = await headObject(tokenData.objectKey);
    if (!head.exists) {
      throw { code: 'FILE_NOT_FOUND_IN_R2', message: 'Chưa phát hiện file đã tải lên R2. Vui lòng thử lại.', status: 400 };
    }

    // Call atomic idempotent RPC function to create submission
    const { data: createdSub, error: rpcErr } = await db.rpc('create_file_submission', {
      p_delivery_id: tokenData.deliveryId,
      p_user_id: claims.id,
      ['p_object_key']: tokenData.objectKey,
      p_file_name: tokenData.fileName,
      p_mime_type: tokenData.mimeType,
      p_file_size: tokenData.fileSize,
      p_is_late: deadlineInfo.isLate,
    });

    if (rpcErr) {
      throw { code: 'INSERT_FAILED', message: rpcErr.message, status: 500 };
    }

    const createdRow = Array.isArray(createdSub) ? createdSub[0] : createdSub;

    // Select complete history safely
    const { data: history } = await db
      .from('submissions')
      .select('*')
      .eq('delivery_id', tokenData.deliveryId)
      .eq('user_id', claims.id)
      .not('object_key', 'is', null)
      .order('submitted_at', { ascending: false });

    return json({
      success: true,
      submission: safeSubmission(createdRow),
      history: (history || []).map(safeSubmission),
    });
  } catch (err) {
    return functionError(err, 'confirm-submission');
  }
});
