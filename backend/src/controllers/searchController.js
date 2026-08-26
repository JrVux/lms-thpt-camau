import { globalSearch } from '../services/searchService.js';

export const handleGlobalSearch = async (req, res) => {
  try {
    const query = req.query.q || '';
    const results = await globalSearch({
      userId: req.user.id,
      role: req.user.role,
      query,
    });
    return res.json(results);
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Lỗi tìm kiếm' });
  }
};
