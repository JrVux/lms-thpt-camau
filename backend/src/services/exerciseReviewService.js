import { supabase } from './pythonSupabaseClient.js';

export const createExerciseReviewService = () => ({
  async listPending({ nhanh, mucDo, limit = 50 }) {
    let query = supabase.from('bai_tap_sinh').select('*, chu_de_id(*)').eq('trang_thai', 'cho_duyet');
    if (nhanh) query = query.eq('nhanh', nhanh);
    if (mucDo) query = query.eq('muc_do', mucDo);
    query = query.order('created_at', { ascending: false }).limit(limit);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async reviewExercise({ id, decision, reviewerId }) {
    if (!['da_duyet', 'tu_choi'].includes(decision)) {
      throw Object.assign(new Error('Quyết định không hợp lệ'), { code: 'INVALID_DECISION' });
    }
    const { data, error } = await supabase
      .from('bai_tap_sinh')
      .update({ trang_thai: decision, duyet_boi: reviewerId })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getDeThiPending() {
    const { data, error } = await supabase
      .from('de_thi')
      .select('*')
      .eq('trang_thai', 'cho_duyet')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async reviewDeThi({ id, decision, reviewerId }) {
    const { data, error } = await supabase
      .from('de_thi')
      .update({ trang_thai: decision, duyet_boi: reviewerId })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
});