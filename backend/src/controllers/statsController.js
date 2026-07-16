import * as statsService from '../services/statsService.js';
import * as topRankService from '../services/topRankService.js';

export const getStats = async (req, res) => {
  try {
    const stats = req.user.role === 'teacher'
      ? await statsService.getTeacherStats(req.user.id)
      : await statsService.getStudentStats(req.user.id);
    return res.json(stats);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const getTopRank = async (req, res) => {
  try {
    const top = await topRankService.getTopRank();
    return res.json(top);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};