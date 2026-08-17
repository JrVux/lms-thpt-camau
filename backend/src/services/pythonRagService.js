import { supabase } from './pythonSupabaseClient.js';
import { cleanAndParseJson } from '../ai/utils/parseJson.js';

const EMBEDDING_DIM = 1536;
const MATCH_THRESHOLD = 0.7;
const TOP_K = 8;

export const createPythonRagService = ({ embeddingProvider, visionProvider } = {}) => {
  const embedText = async (text) => {
    if (!embeddingProvider?.isConfigured) {
      throw Object.assign(new Error('Embedding provider chưa được cấu hình'), { code: 'EMBEDDING_NOT_CONFIGURED' });
    }
    return embeddingProvider.generateEmbedding(text);
  };

  const searchTaiLieu = async ({ query, nhanh, limit = TOP_K }) => {
    const queryVector = await embedText(query);
    const { data, error } = await supabase.rpc('match_tai_lieu', {
      query_embedding: queryVector,
      match_threshold: MATCH_THRESHOLD,
      match_count: limit,
      filter_nhanh: nhanh || null,
    });
    if (error) throw Object.assign(new Error(`RAG search error: ${error.message}`), { code: 'RAG_SEARCH_ERROR' });
    return data || [];
  };

  const getImagesForChunks = async (taiLieuIds) => {
    if (!taiLieuIds?.length) return [];
    const { data, error } = await supabase
      .from('tai_lieu_hinh_anh')
      .select('id, file_path, mo_ta, tai_lieu_id')
      .in('tai_lieu_id', taiLieuIds)
      .eq('trang_thai', 'da_xu_ly');
    if (error) throw Object.assign(new Error(`Image lookup error: ${error.message}`), { code: 'IMAGE_LOOKUP_ERROR' });
    return data || [];
  };

  const buildContextFromChunks = (chunks) => {
    return chunks.map((c, i) => `[${i + 1}] (${c.chuyen_de}, ${c.loai}, độ khó: ${c.muc_do || 'N/A'})\n${c.noi_dung}`).join('\n\n');
  };

  const search = async ({ query, nhanh }) => {
    const chunks = await searchTaiLieu({ query, nhanh });
    const context = buildContextFromChunks(chunks);
    const taiLieuIds = chunks.map(c => c.id).filter(Boolean);
    const images = await getImagesForChunks(taiLieuIds);
    return { chunks, context, images };
  };

  return { search, embedText, searchTaiLieu, getImagesForChunks, buildContextFromChunks };
};