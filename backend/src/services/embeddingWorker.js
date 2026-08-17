import { supabase } from './pythonSupabaseClient.js';
import { splitText, extractTextFromPdf, extractTextFromDocx, detectFileType } from './documentPipelineService.js';

const BATCH_SIZE = 10;
const VISION_BATCH_SIZE = 5;
const MAX_RETRIES = 3;

export const createEmbeddingWorker = ({ embeddingProvider, visionProvider }) => {
  const processEmbeddingQueue = async () => {
    const { data: batch, error } = await supabase
      .from('queue_embedding')
      .select('id, tai_lieu_id')
      .eq('trang_thai', 'cho_xu_ly')
      .lte('so_lan_thu', MAX_RETRIES - 1)
      .limit(BATCH_SIZE);

    if (error) throw error;
    if (!batch?.length) return { processed: 0 };

    let processed = 0;
    for (const job of batch) {
      try {
        const { data: taiLieu } = await supabase
          .from('tai_lieu')
          .select('noi_dung, id')
          .eq('id', job.tai_lieu_id)
          .single();

        if (!taiLieu) {
          await markJobFailed(job.id, 'Tài liệu không tồn tại');
          continue;
        }

        await supabase
          .from('queue_embedding')
          .update({ trang_thai: 'dang_xu_ly' })
          .eq('id', job.id);

        const embedding = await embeddingProvider.generateEmbedding(taiLieu.noi_dung);

        await supabase
          .from('tai_lieu')
          .update({ embedding, trang_thai: 'da_xu_ly' })
          .eq('id', taiLieu.id);

        await supabase
          .from('queue_embedding')
          .update({ trang_thai: 'xong' })
          .eq('id', job.id);

        processed++;
      } catch (err) {
        await handleJobError('queue_embedding', job.id, err.message);
      }
    }
    return { processed };
  };

  const processVisionQueue = async () => {
    const { data: batch, error } = await supabase
      .from('queue_vision_caption')
      .select('id, hinh_anh_id')
      .eq('trang_thai', 'cho_xu_ly')
      .lte('so_lan_thu', MAX_RETRIES - 1)
      .limit(VISION_BATCH_SIZE);

    if (error) throw error;
    if (!batch?.length) return { processed: 0 };

    let processed = 0;
    for (const job of batch) {
      try {
        const { data: hinhAnh } = await supabase
          .from('tai_lieu_hinh_anh')
          .select('file_path, id')
          .eq('id', job.hinh_anh_id)
          .single();

        if (!hinhAnh || !visionProvider?.isConfigured) {
          await markVisionJobFailed(job.id, 'Vision provider không khả dụng');
          continue;
        }

        await supabase
          .from('queue_vision_caption')
          .update({ trang_thai: 'dang_xu_ly' })
          .eq('id', job.id);

        const moTa = await visionProvider.generateCaption(hinhAnh.file_path);
        const captionEmbedding = await embeddingProvider.generateEmbedding(moTa);

        await supabase
          .from('tai_lieu_hinh_anh')
          .update({ mo_ta: moTa, embedding: captionEmbedding, trang_thai: 'da_xu_ly' })
          .eq('id', hinhAnh.id);

        await supabase
          .from('queue_vision_caption')
          .update({ trang_thai: 'xong' })
          .eq('id', job.id);

        processed++;
      } catch (err) {
        await handleJobError('queue_vision_caption', job.id, err.message);
      }
    }
    return { processed };
  };

  const handleJobError = async (table, jobId, errorMessage) => {
    const { data: job } = await supabase
      .from(table)
      .select('so_lan_thu')
      .eq('id', jobId)
      .single();

    const newAttempts = (job?.so_lan_thu || 0) + 1;
    const isFinal = newAttempts >= MAX_RETRIES;

    await supabase
      .from(table)
      .update({
        trang_thai: isFinal ? 'loi' : 'cho_xu_ly',
        so_lan_thu: newAttempts,
        loi: isFinal ? errorMessage : null,
      })
      .eq('id', jobId);
  };

  const markJobFailed = async (jobId, reason) => {
    await supabase
      .from('queue_embedding')
      .update({ trang_thai: 'loi', loi: reason })
      .eq('id', jobId);
  };

  const markVisionJobFailed = async (jobId, reason) => {
    await supabase
      .from('queue_vision_caption')
      .update({ trang_thai: 'loi', loi: reason })
      .eq('id', jobId);
  };

  return { processEmbeddingQueue, processVisionQueue };
};