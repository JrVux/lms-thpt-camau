import { createPythonAssistantService } from '../services/pythonAssistantService.js';
import { createPythonAiGateway } from '../services/pythonAiGateway.js';
import { supabase } from '../services/pythonSupabaseClient.js';
import { splitText, extractTextFromPdf, extractTextFromDocx, detectFileType } from '../services/documentPipelineService.js';
import { createEmbeddingWorker } from '../services/embeddingWorker.js';

let service = null;
let worker = null;

const getService = () => {
  if (service) return service;
  throw Object.assign(new Error('Python assistant service chưa được khởi tạo'), { code: 'SERVICE_NOT_INITIALIZED' });
};

const getWorker = () => {
  if (worker) return worker;
  throw Object.assign(new Error('Embedding worker chưa được khởi tạo'), { code: 'WORKER_NOT_INITIALIZED' });
};

export const initializePythonAssistant = ({ openRouter, gemini, embeddingProvider, visionProvider }) => {
  const gateway = createPythonAiGateway({ openRouter, gemini });
  service = createPythonAssistantService({ aiProvider: gateway, embeddingProvider, visionProvider });
  worker = createEmbeddingWorker({ embeddingProvider, visionProvider });
};

export const chat = async (req, res, next) => {
  try {
    const { question, nhanh, lichSu } = req.body;
    if (!question?.trim()) return res.status(400).json({ success: false, message: 'Thiếu câu hỏi', code: 'MISSING_QUESTION' });
    if (!['dai-tra', 'hsg'].includes(nhanh)) return res.status(400).json({ success: false, message: 'Nhánh không hợp lệ', code: 'INVALID_BRANCH' });

    const result = await getService().chat({ question: question.trim(), nhanh, lichSu: lichSu || [], userId: req.user.id });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const chatStream = async (req, res, next) => {
  try {
    const { question, nhanh, lichSu } = req.body;
    if (!question?.trim()) return res.status(400).json({ success: false, message: 'Thiếu câu hỏi', code: 'MISSING_QUESTION' });
    if (!['dai-tra', 'hsg'].includes(nhanh)) return res.status(400).json({ success: false, message: 'Nhánh không hợp lệ', code: 'INVALID_BRANCH' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const result = await getService().chat({ question: question.trim(), nhanh, lichSu: lichSu || [], userId: req.user.id });

    // Gửi từng chunk
    const reply = result.reply;
    const chunkSize = 50;
    for (let i = 0; i < reply.length; i += chunkSize) {
      const chunk = reply.slice(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
      await new Promise(r => setTimeout(r, 15));
    }

    // Gửi metadata kèm nguồn tham khảo
    res.write(`data: ${JSON.stringify({ type: 'done', sources: result.nguon_tham_khao, images: result.hinh_anh, webSearch: result.web_search })}\n\n`);
    res.end();
  } catch (err) {
    if (!res.headersSent) return next(err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
};

export const searchDocuments = async (req, res, next) => {
  try {
    const { query, nhanh } = req.body;
    if (!query?.trim()) return res.status(400).json({ success: false, message: 'Thiếu truy vấn', code: 'MISSING_QUERY' });
    if (nhanh && !['dai-tra', 'hsg'].includes(nhanh)) return res.status(400).json({ success: false, message: 'Nhánh không hợp lệ', code: 'INVALID_BRANCH' });

    const { createPythonRagService } = await import('../services/pythonRagService.js');
    const { createGeminiEmbeddingProvider, createOpenRouterEmbeddingProvider } = await import('../ai/providers/pythonEmbeddingProvider.js');
    const ep = process.env.GEMINI_API_KEY
      ? createGeminiEmbeddingProvider({ apiKey: process.env.GEMINI_API_KEY })
      : createOpenRouterEmbeddingProvider({ apiKey: process.env.OPENROUTER_API_KEY });
    const rag = createPythonRagService({ embeddingProvider: ep });
    const { chunks, images } = await rag.search({ query: query.trim(), nhanh });

    res.json({ success: true, data: { chunks, images } });
  } catch (err) {
    next(err);
  }
};

export const getLearningPath = async (req, res, next) => {
  try {
    const { nhanh } = req.query;
    if (!['dai-tra', 'hsg'].includes(nhanh)) return res.status(400).json({ success: false, message: 'Nhánh không hợp lệ', code: 'INVALID_BRANCH' });

    const path = await getService().getLearningPath({ nhanh, userId: req.user.role === 'student' ? req.user.id : null });
    res.json({ success: true, data: path });
  } catch (err) {
    next(err);
  }
};

export const updateProgress = async (req, res, next) => {
  try {
    const { chu_de_id, trang_thai } = req.body;
    if (!chu_de_id || !['chua_hoc', 'dang_hoc', 'da_xong'].includes(trang_thai)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ', code: 'INVALID_PROGRESS_DATA' });
    }
    const result = await getService().updateProgress({ userId: req.user.id, chuDeId: chu_de_id, trangThai: trang_thai });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const generateExercise = async (req, res, next) => {
  try {
    const { chu_de, muc_do, nhanh } = req.body;
    if (!chu_de || !muc_do || !nhanh) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bài tập', code: 'MISSING_EXERCISE_INFO' });
    }
    const result = await getService().generateExercise({ chuDe: chu_de, mucDo: muc_do, nhanh, teacherId: req.user.id });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

export const listDocuments = async (req, res, next) => {
  try {
    const { nhanh, chuyen_de, trang_thai } = req.query;
    let query = supabase.from('tai_lieu').select('*', { count: 'exact' });
    if (nhanh) query = query.eq('nhanh', nhanh);
    if (chuyen_de) query = query.eq('chuyen_de', chuyen_de);
    if (trang_thai) query = query.eq('trang_thai', trang_thai);
    query = query.order('created_at', { ascending: false }).limit(100);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ success: true, data, count });
  } catch (err) {
    next(err);
  }
};

export const uploadDocument = async (req, res, next) => {
  try {
    let { ten_file, noi_dung, chuyen_de, nhanh, loai, muc_do, file_buffer, file_mime } = req.body;
    if (!ten_file || !chuyen_de || !nhanh || !loai) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin tài liệu', code: 'MISSING_DOC_INFO' });
    }

    // Sanitize ten_file
    const safeFileName = ten_file.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200);

    // Upload file gốc lên Supabase Storage
    let filePath = `upload/${nhanh}/${safeFileName}`;
    if (file_buffer) {
      const buffer = Buffer.from(file_buffer, 'base64');

      // Trích xuất text nếu chưa có noi_dung
      if (!noi_dung) {
        const fileType = detectFileType(ten_file);
        if (fileType === 'pdf') {
          const pages = await extractTextFromPdf(buffer);
          noi_dung = pages.map(p => p.text).join('\n\n');
        } else if (fileType === 'docx') {
          const pages = await extractTextFromDocx(buffer);
          noi_dung = pages.map(p => p.text).join('\n\n');
        } else {
          noi_dung = buffer.toString('utf-8');
        }
      }

      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.find(b => b.name === 'tai-lieu')) {
        await supabase.storage.createBucket('tai-lieu', { public: true });
      }

      const { error: storageError } = await supabase.storage
        .from('tai-lieu')
        .upload(filePath, buffer, {
          contentType: file_mime || 'application/octet-stream',
          upsert: true,
        });
      if (storageError && !storageError.message?.includes('Duplicate')) {
        throw Object.assign(new Error(`Storage upload error: ${storageError.message}`), { code: 'STORAGE_UPLOAD_ERROR' });
      }
      const { data: { publicUrl } } = supabase.storage.from('tai-lieu').getPublicUrl(filePath);
      filePath = publicUrl;
    }

    if (!noi_dung) return res.status(400).json({ success: false, message: 'Thiếu nội dung tài liệu', code: 'MISSING_CONTENT' });

    const chunks = splitText(noi_dung);
    const records = chunks.map((text, i) => ({
      file_path: filePath,
      ten_file,
      chuyen_de,
      nhanh,
      loai,
      muc_do: muc_do || null,
      noi_dung: text,
      thu_tu_chunk: i + 1,
      trang_thai: 'cho_xu_ly',
    }));

    const { data, error } = await supabase.from('tai_lieu').insert(records).select();
    if (error) throw error;

    const queueRecords = data.map(d => ({ tai_lieu_id: d.id }));
    await supabase.from('queue_embedding').insert(queueRecords);

    res.json({ success: true, data, message: `Đã nạp ${records.length} chunk vào hàng đợi xử lý` });
  } catch (err) {
    next(err);
  }
};

export const getDocumentDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('tai_lieu').select('*').eq('id', id).single();
    if (error) return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu', code: 'DOC_NOT_FOUND' });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getDocumentImages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('tai_lieu_hinh_anh')
      .select('*')
      .eq('tai_lieu_id', id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const processQueues = async (req, res, next) => {
  try {
    const w = getWorker();
    const embedResult = await w.processEmbeddingQueue();
    const visionResult = await w.processVisionQueue();
    res.json({
      success: true,
      data: { embedding_processed: embedResult.processed, vision_processed: visionResult.processed },
    });
  } catch (err) {
    next(err);
  }
};

export const webSearch = async (req, res, next) => {
  try {
    const { query } = req.body;
    if (!query?.trim()) return res.status(400).json({ success: false, message: 'Thiếu truy vấn', code: 'MISSING_QUERY' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return res.status(503).json({ success: false, message: 'Web search chưa được cấu hình', code: 'SEARCH_NOT_CONFIGURED' });
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/web-search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim(), count: 5 }),
    });

    if (!response.ok) {
      return res.status(502).json({ success: false, message: 'Web search API error', code: 'SEARCH_API_ERROR' });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
};