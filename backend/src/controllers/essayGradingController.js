import { supabase } from '../services/supabaseClient.js';
import { createEssayGradingService } from '../services/essayGradingService.js';
import { createFileSubmissionService } from '../services/fileSubmissionService.js';

const grading = createEssayGradingService(supabase);
const files = createFileSubmissionService(supabase);
const failure = (res, error) => res.status(error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'BAD_REQUEST' ? 400 : 500)
  .json({ success: false, message: error.message || 'Thao tác không thành công', code: error.code || 'ERROR' });

export const getEssayGrading = async (req, res) => {
  try {
    return res.json(await grading.teacherReport({ teacherId: req.user.id, submissionId: req.params.submissionId }));
  } catch (error) { return failure(res, error); }
};

export const reviewEssayGrading = async (req, res) => {
  try {
    const report = await grading.saveReview({
      teacherId: req.user.id,
      submissionId: req.params.submissionId,
      criteriaResults: req.body.criteria_results,
      feedback: req.body.feedback,
      approved: req.body.approved,
      showModelAnswer: req.body.show_model_answer,
    });
    return res.json({ success: true, report });
  } catch (error) { return failure(res, error); }
};

export const retryEssayGrading = async (req, res) => {
  try {
    const job = await grading.retry({ teacherId: req.user.id, submissionId: req.params.submissionId });
    return res.status(202).json({ success: true, job });
  } catch (error) { return failure(res, error); }
};

export const publishEssayResults = async (req, res) => {
  try {
    let submissionIds = Array.isArray(req.body.submission_ids) ? req.body.submission_ids : [];
    if (req.body.mode === 'all') {
      const roster = await files.getTeacherRoster({ teacherId: req.user.id, assignmentId: req.params.assignmentId });
      submissionIds = roster.map((row) => row.latest?.id).filter(Boolean);
    }
    if (!submissionIds.length) {
      const error = new Error('Chưa chọn bài nộp để công bố.'); error.code = 'BAD_REQUEST'; throw error;
    }
    const results = await grading.setPublished({ teacherId: req.user.id, submissionIds, published: req.body.published !== false });
    return res.json({ success: true, results });
  } catch (error) { return failure(res, error); }
};
