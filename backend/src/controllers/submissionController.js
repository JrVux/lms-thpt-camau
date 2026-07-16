import * as submissionService from '../services/submissionService.js';

// POST /api/submit - Nộp bài
export const submit = async (req, res) => {
  try {
    const { assignment_id, code, results } = req.body;

    if (!assignment_id || !code || !results) {
      return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin' });
    }

    if (!Array.isArray(results)) {
      return res.status(400).json({ message: 'results phải là một mảng' });
    }

    const result = await submissionService.submit(
      { assignment_id, code, results },
      req.user.id
    );

    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// GET /api/classes/:id/gradebook - Bảng điểm
export const getGradebook = async (req, res) => {
  try {
    const { id } = req.params;
    const gradebook = await submissionService.getGradebook(id, req.user.id);
    return res.json(gradebook);
  } catch (error) {
    return res.status(403).json({ message: error.message });
  }
};

// GET /api/classes/:id/gradebook/export - Export CSV
export const exportGradebook = async (req, res) => {
  try {
    const { id } = req.params;
    const csv = await submissionService.exportGradebookCSV(id, req.user.id);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=gradebook_${id}.csv`);
    return res.send(csv);
  } catch (error) {
    return res.status(403).json({ message: error.message });
  }
};

// GET /api/submissions/my/:assignment_id - Xem bài nộp của mình
export const getMySubmission = async (req, res) => {
  try {
    const { assignment_id } = req.params;
    const result = await submissionService.getMySubmission(assignment_id, req.user.id);

    if (!result.data) {
      return res.json({ message: 'Bạn chưa nộp bài tập này', data: null, ...result });
    }

    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
