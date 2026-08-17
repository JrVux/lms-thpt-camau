import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { authenticate, requireRole, requireAIAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as pythonAssistantController from '../controllers/pythonAssistantController.js';
import * as exerciseReviewController from '../controllers/exerciseReviewController.js';

const router = Router();

const NHANH_VALUES = ['dai-tra', 'hsg'];
const TRANG_THAI_VALUES = ['cho_xu_ly', 'da_xu_ly', 'loi'];

// Tất cả routes Python Assistant đều yêu cầu requireAIAdmin

// Chat agent
router.post('/api/python-assistant/chat', authenticate, requireAIAdmin, [
  body('question').trim().isLength({ min: 1, max: 4000 }).withMessage('Câu hỏi phải từ 1-4000 ký tự'),
  body('nhanh').isIn(NHANH_VALUES).withMessage('Nhánh không hợp lệ'),
  body('lichSu').optional().isArray().withMessage('Lịch sử phải là mảng'),
  validate,
], pythonAssistantController.chat);

// Streaming chat (SSE)
router.post('/api/python-assistant/chat/stream', authenticate, requireAIAdmin, [
  body('question').trim().isLength({ min: 1, max: 4000 }).withMessage('Câu hỏi phải từ 1-4000 ký tự'),
  body('nhanh').isIn(NHANH_VALUES).withMessage('Nhánh không hợp lệ'),
  body('lichSu').optional().isArray().withMessage('Lịch sử phải là mảng'),
  validate,
], pythonAssistantController.chatStream);

// Tìm kiếm tài liệu
router.post('/api/python-assistant/search', authenticate, requireAIAdmin, [
  body('query').trim().isLength({ min: 1 }).withMessage('Thiếu truy vấn'),
  body('nhanh').optional().isIn(NHANH_VALUES).withMessage('Nhánh không hợp lệ'),
  validate,
], pythonAssistantController.searchDocuments);

// Lộ trình học (public cho học sinh, không cần admin)
router.get('/api/python-assistant/learning-path', authenticate, [
  query('nhanh').isIn(NHANH_VALUES).withMessage('Nhánh không hợp lệ'),
  validate,
], pythonAssistantController.getLearningPath);

router.post('/api/python-assistant/learning-path/progress', authenticate, requireRole('student'), requireAIAdmin, [
  body('chu_de_id').isUUID().withMessage('ID chủ đề không hợp lệ'),
  body('trang_thai').isIn(['chua_hoc', 'dang_hoc', 'da_xong']).withMessage('Trạng thái không hợp lệ'),
  validate,
], pythonAssistantController.updateProgress);

// Sinh bài tập (giáo viên)
router.post('/api/python-assistant/exercises/generate', authenticate, requireRole('teacher'), requireAIAdmin, [
  body('chu_de').trim().isLength({ min: 1 }).withMessage('Thiếu chủ đề'),
  body('muc_do').isIn(['CB', 'TB', 'NC', 'HSG']).withMessage('Mức độ không hợp lệ'),
  body('nhanh').isIn(NHANH_VALUES).withMessage('Nhánh không hợp lệ'),
  validate,
], pythonAssistantController.generateExercise);

// Quản lý tài liệu (giáo viên)
router.get('/api/python-assistant/documents', authenticate, requireRole('teacher'), requireAIAdmin, [
  query('nhanh').optional().isIn(NHANH_VALUES),
  query('trang_thai').optional().isIn(TRANG_THAI_VALUES),
  validate,
], pythonAssistantController.listDocuments);

router.post('/api/python-assistant/documents/upload', authenticate, requireRole('teacher'), requireAIAdmin, [
  body('ten_file').trim().notEmpty().withMessage('Thiếu tên file'),
  body('noi_dung').trim().isLength({ min: 1 }).withMessage('Thiếu nội dung'),
  body('chuyen_de').trim().notEmpty().withMessage('Thiếu chuyên đề'),
  body('nhanh').isIn(NHANH_VALUES).withMessage('Nhánh không hợp lệ'),
  body('loai').isIn(['ly-thuyet', 'bai-tap', 'de-thi']).withMessage('Loại không hợp lệ'),
  body('muc_do').optional().isIn(['CB', 'TB', 'NC', 'HSG']),
  validate,
], pythonAssistantController.uploadDocument);

router.get('/api/python-assistant/documents/:id', authenticate, requireAIAdmin, [
  param('id').isUUID().withMessage('ID tài liệu không hợp lệ'),
  validate,
], pythonAssistantController.getDocumentDetail);

router.get('/api/python-assistant/documents/:id/images', authenticate, requireAIAdmin, [
  param('id').isUUID().withMessage('ID tài liệu không hợp lệ'),
  validate,
], pythonAssistantController.getDocumentImages);

// Worker queue processing
router.post('/api/python-assistant/process-queues', authenticate, requireRole('teacher'), requireAIAdmin, pythonAssistantController.processQueues);

// Duyệt bài tập AI sinh (giáo viên)
router.get('/api/python-assistant/exercises/pending', authenticate, requireRole('teacher'), requireAIAdmin, [
  query('nhanh').optional().isIn(NHANH_VALUES),
  query('muc_do').optional().isIn(['CB', 'TB', 'NC', 'HSG']),
  validate,
], exerciseReviewController.listPendingExercises);

router.post('/api/python-assistant/exercises/:id/review', authenticate, requireRole('teacher'), requireAIAdmin, [
  param('id').isUUID().withMessage('ID bài tập không hợp lệ'),
  body('decision').isIn(['da_duyet', 'tu_choi']).withMessage('Quyết định không hợp lệ'),
  validate,
], exerciseReviewController.reviewExercise);

// Đề thi
router.get('/api/python-assistant/exams/pending', authenticate, requireRole('teacher'), requireAIAdmin, exerciseReviewController.listDeThiPending);

router.post('/api/python-assistant/exams/:id/review', authenticate, requireRole('teacher'), requireAIAdmin, [
  param('id').isUUID().withMessage('ID đề thi không hợp lệ'),
  body('decision').isIn(['da_duyet', 'tu_choi']).withMessage('Quyết định không hợp lệ'),
  validate,
], exerciseReviewController.reviewDeThi);

// Tra cứu web
router.post('/api/python-assistant/web-search', authenticate, requireAIAdmin, [
  body('query').trim().isLength({ min: 1, max: 500 }).withMessage('Truy vấn phải từ 1-500 ký tự'),
  validate,
], pythonAssistantController.webSearch);

export default router;