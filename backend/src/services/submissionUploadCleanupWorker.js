import fs from 'fs';
import path from 'path';
import { deleteObjectFromR2 } from './r2Service.js';

const uniqueSessions = (sessions) => {
  const byId = new Map();
  for (const session of sessions || []) {
    if (session?.id && session.status !== 'confirmed') byId.set(session.id, session);
  }
  return [...byId.values()].slice(0, 20);
};

export const createSubmissionUploadCleanupWorker = ({
  db,
  uploadsDir = path.join(process.cwd(), 'uploads/submissions'),
  r2Delete = deleteObjectFromR2,
  removeFile = fs.promises.unlink,
  now = () => Date.now(),
  listCandidates,
  cleanupSession,
} = {}) => {
  const defaultListCandidates = async () => {
    const nowIso = new Date(now()).toISOString();
    const [pendingResult, expiredResult] = await Promise.all([
      db.from('submission_upload_sessions').select('*').eq('status', 'cleanup_pending').order('updated_at').limit(20),
      db.from('submission_upload_sessions').select('*').eq('status', 'uploading').lt('expires_at', nowIso).order('expires_at').limit(20),
    ]);
    if (pendingResult.error) throw new Error(pendingResult.error.message);
    if (expiredResult.error) throw new Error(expiredResult.error.message);
    return uniqueSessions([...(pendingResult.data || []), ...(expiredResult.data || [])]);
  };

  const updateFile = async (fileId, patch) => {
    const { error } = await db.from('submission_upload_session_files').update({ ...patch, updated_at: new Date(now()).toISOString() }).eq('id', fileId);
    if (error) throw new Error(error.message);
  };

  const updateSession = async (sessionId, patch) => {
    const { error } = await db.from('submission_upload_sessions').update({ ...patch, updated_at: new Date(now()).toISOString() }).eq('id', sessionId);
    if (error) throw new Error(error.message);
  };

  const defaultCleanupSession = async (candidate) => {
    if (!candidate || candidate.status === 'confirmed') return false;
    const expired = candidate.status === 'uploading' && new Date(candidate.expires_at).getTime() <= now();
    const cleanupReason = expired ? 'expired' : candidate.cleanup_reason || 'cancelled';
    await updateSession(candidate.id, { status: 'cleanup_pending', cleanup_reason: cleanupReason });

    const { data: files, error } = await db
      .from('submission_upload_session_files')
      .select('*')
      .eq('session_id', candidate.id)
      .in('status', ['uploaded', 'cleanup_pending']);
    if (error) throw new Error(error.message);

    let complete = true;
    for (const file of files || []) {
      let fileComplete = true;
      const relativePath = file.object_key?.startsWith('local://')
        ? file.object_key.slice('local://'.length).replace(/\\/g, '/')
        : '';
      const expectedPrefix = `tmp/${candidate.id}/`;
      if (!relativePath.startsWith(expectedPrefix)) {
        complete = false;
        await updateFile(file.id, { status: 'cleanup_pending' });
        continue;
      }

      const root = path.resolve(uploadsDir);
      const localPath = path.resolve(root, relativePath);
      if (localPath !== root && localPath.startsWith(`${root}${path.sep}`)) {
        try { await removeFile(localPath); } catch (removeError) {
          if (removeError?.code !== 'ENOENT') fileComplete = false;
        }
      } else {
        fileComplete = false;
      }

      const objectKey = `${candidate.delivery_id}/${candidate.user_id}/${relativePath}`;
      const deleted = await r2Delete({ objectKey });
      if (!deleted) fileComplete = false;
      if (!fileComplete) {
        await updateFile(file.id, { status: 'cleanup_pending' });
        complete = false;
      } else {
        await updateFile(file.id, { status: 'cleaned' });
      }
    }

    if (complete) {
      await updateSession(candidate.id, {
        status: cleanupReason === 'expired' ? 'expired' : 'cancelled',
        cleanup_reason: cleanupReason,
      });
    }
    return complete;
  };

  const runOnce = async () => {
    const candidates = uniqueSessions(await (listCandidates || defaultListCandidates)());
    let cleaned = 0;
    let pending = 0;
    for (const session of candidates) {
      try {
        if (await (cleanupSession || defaultCleanupSession)(session)) cleaned += 1;
        else pending += 1;
      } catch {
        pending += 1;
      }
    }
    return { processed: candidates.length, cleaned, pending };
  };

  const start = ({ intervalMs = 60_000 } = {}) => {
    const timer = setInterval(() => { runOnce().catch(() => {}); }, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
  };

  return { runOnce, start, cleanupSession: defaultCleanupSession };
};
