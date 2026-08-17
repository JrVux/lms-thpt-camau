import { supabase } from './pythonSupabaseClient.js';
import { createPythonRagService } from './pythonRagService.js';
import { buildPythonAssistantSystemPrompt, buildPythonAssistantUserPrompt, buildExerciseGenerationSystemPrompt, PROMPT_VERSION } from '../ai/pythonAssistantPrompt.js';

export const createPythonAssistantService = ({ aiProvider, embeddingProvider, visionProvider }) => {
  const rag = createPythonRagService({ embeddingProvider, visionProvider });

  const webSearch = async (query) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return null;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/web-search`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, count: 5 }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.success) return null;
      return data.data;
    } catch {
      return null;
    }
  };

  const chat = async ({ question, nhanh, lichSu, userId }) => {
    const { context, chunks, images } = await rag.search({ query: question, nhanh });
    let webResults = null;

    // Nếu RAG không tìm thấy context đủ, thử web search
    if (!context || chunks.length < 3) {
      webResults = await webSearch(question);
    }

    const webContext = webResults?.results?.length
      ? `\nKết quả tra cứu web:\n${webResults.results.map((r, i) => `[${i + 1}] ${r.title}: ${r.snippet} (${r.url})`).join('\n')}`
      : '';

    const systemPrompt = buildPythonAssistantSystemPrompt(nhanh, context + webContext);
    const userPrompt = buildPythonAssistantUserPrompt(question, lichSu);

    const response = await aiProvider.generateChat({ system: systemPrompt, user: userPrompt });

    const result = {
      reply: response.content,
      nguon_tham_khao: chunks.map(c => ({
        id: c.id,
        chuyen_de: c.chuyen_de,
        noi_dung: c.noi_dung.substring(0, 200),
        muc_do: c.muc_do,
        ten_file: c.ten_file,
      })),
      hinh_anh: images.map(img => ({
        id: img.id,
        file_path: img.file_path,
        mo_ta: img.mo_ta,
      })),
      web_search: webResults || undefined,
    };

    return result;
  };

  const generateExercise = async ({ chuDe, mucDo, nhanh, teacherId }) => {
    const { search } = rag;
    const { context } = await search({ query: `Bài tập ${chuDe} mức ${mucDo}`, nhanh });

    const system = buildExerciseGenerationSystemPrompt();
    const user = [
      `Chủ đề: ${chuDe}`,
      `Mức độ: ${mucDo}`,
      `Nhánh: ${nhanh}`,
      `Tài liệu tham khảo:`,
      context || 'Không có tài liệu tham khảo cụ thể',
    ].join('\n');

    const response = await aiProvider.generateStructured({ system, user });
    const baiTap = response.value;

    const { data, error } = await supabase.from('bai_tap_sinh').insert({
      muc_do: mucDo,
      noi_dung: baiTap,
      trang_thai: 'cho_duyet',
    }).select().single();

    if (error) throw Object.assign(new Error(`Insert exercise error: ${error.message}`), { code: 'EXERCISE_INSERT_ERROR' });
    return data;
  };

  const getLearningPath = async ({ nhanh, userId }) => {
    const { data: chuDe, error } = await supabase
      .from('lo_trinh_chu_de')
      .select('*')
      .eq('nhanh', nhanh)
      .order('thu_tu', { ascending: true });
    if (error) throw Object.assign(new Error(`Learning path error: ${error.message}`), { code: 'LEARNING_PATH_ERROR' });

    let tienDo = [];
    if (userId) {
      const { data: td } = await supabase
        .from('tien_do_hoc_sinh')
        .select('*')
        .eq('hoc_sinh_id', userId);
      tienDo = td || [];
    }

    return chuDe.map(node => {
      const progress = tienDo.find(t => t.chu_de_id === node.id);
      return { ...node, trang_thai: progress?.trang_thai || 'chua_hoc' };
    });
  };

  const updateProgress = async ({ userId, chuDeId, trangThai }) => {
    const { data, error } = await supabase
      .from('tien_do_hoc_sinh')
      .upsert({
        hoc_sinh_id: userId,
        chu_de_id: chuDeId,
        trang_thai: trangThai,
        cap_nhat_luc: new Date().toISOString(),
      }, { onConflict: 'hoc_sinh_id,chu_de_id' })
      .select()
      .single();
    if (error) throw Object.assign(new Error(`Progress update error: ${error.message}`), { code: 'PROGRESS_UPDATE_ERROR' });
    return data;
  };

  return { chat, generateExercise, getLearningPath, updateProgress };
};