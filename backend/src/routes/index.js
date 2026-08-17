import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, requireRole, requireAIAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as authController from '../controllers/authController.js';
import * as classController from '../controllers/classController.js';
import * as assignmentController from '../controllers/assignmentController.js';
import * as assignmentLibraryController from '../controllers/assignmentLibraryController.js';
import * as assignmentDeliveryController from '../controllers/assignmentDeliveryController.js';
import * as studentAssignmentController from '../controllers/studentAssignmentController.js';
import * as submissionController from '../controllers/submissionController.js';
import * as statsController from '../controllers/statsController.js';
import * as competencyController from '../controllers/competencyController.js';
import * as studentAnalysisController from '../controllers/studentAnalysisController.js';
import * as aiAssignmentController from '../controllers/aiAssignmentController.js';

const router = Router();

// Auth routes
router.post('/api/register', [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('TÃªn Ä‘Äƒng nháº­p pháº£i tá»« 3-50 kÃ½ tá»±'),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail().withMessage('Email khÃ´ng há»£p lá»‡'),
  body('password').isLength({ min: 6 }).withMessage('Máº­t kháº©u pháº£i cÃ³ Ã­t nháº¥t 6 kÃ½ tá»±'),
  body('full_name').trim().notEmpty().withMessage('Há» tÃªn khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng'),
  body('role').optional().isIn(['teacher', 'student']).withMessage('Vai trÃ² khÃ´ng há»£p lá»‡'),
  validate,
], authController.register);

router.post('/api/login', [
  body('password').notEmpty().withMessage('Máº­t kháº©u khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng'),
  validate,
], authController.login);

// Class routes
router.post('/api/classes', authenticate, requireRole('teacher'), [
  body('name').trim().notEmpty().withMessage('TÃªn lá»›p khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng'),
  body('grade').isIn(['10', '11', '12']).withMessage('Khá»‘i lá»›p pháº£i lÃ  10, 11 hoáº·c 12'),
  validate,
], classController.create);

router.get('/api/classes', authenticate, classController.list);
router.delete('/api/classes/:id', authenticate, requireRole('teacher'), classController.deleteClass);

router.post('/api/classes/join', authenticate, requireRole('student'), [
  body('class_code').trim().isLength({ min: 6, max: 6 }).withMessage('MÃ£ lá»›p pháº£i 6 kÃ½ tá»±'),
  validate,
], classController.join);

router.get('/api/classes/:id/students', authenticate, requireRole('teacher'), classController.getStudents);
router.post('/api/classes/:id/students', authenticate, requireRole('teacher'), classController.addStudent);
router.patch('/api/classes/:id/students/:userId', authenticate, requireRole('teacher'), classController.updateStudent);
router.delete('/api/classes/:id/students/:userId', authenticate, requireRole('teacher'), classController.removeStudent);
router.post('/api/classes/:id/students/reset-password', authenticate, requireRole('teacher'), classController.resetStudentPassword);
router.post('/api/classes/:id/students/bulk-import', authenticate, requireRole('teacher'), classController.bulkImportStudents);
router.get('/api/students/search', authenticate, requireRole('teacher'), classController.searchStudents);
router.get('/api/students/unassigned', authenticate, requireRole('teacher'), classController.getUnassignedStudents);
router.delete('/api/students/:userId', authenticate, requireRole('teacher'), classController.deleteStudentAccount);
router.post('/api/classes/:id/students/enroll', authenticate, requireRole('teacher'), classController.enrollExistingStudent);

// Assignment library routes (must stay before /api/assignments/:id)
router.get('/api/assignment-library', authenticate, requireRole('teacher'), assignmentLibraryController.list);
router.post('/api/assignment-library', authenticate, requireRole('teacher'), assignmentLibraryController.create);
router.get('/api/assignment-library/:id', authenticate, requireRole('teacher'), assignmentLibraryController.get);
router.patch('/api/assignment-library/:id', authenticate, requireRole('teacher'), assignmentLibraryController.update);
router.post('/api/assignment-library/:id/test-cases', authenticate, requireRole('teacher'), assignmentLibraryController.replaceTestCases);
router.post('/api/assignment-library/:id/deliver', authenticate, requireRole('teacher'), assignmentDeliveryController.deliver);
router.get('/api/assignment-library/:id/deliveries', authenticate, requireRole('teacher'), assignmentDeliveryController.listForTemplate);
router.patch('/api/assignment-deliveries/:id', authenticate, requireRole('teacher'), assignmentDeliveryController.update);
router.post('/api/assignment-deliveries/:id/detach', authenticate, requireRole('teacher'), assignmentDeliveryController.detach);
router.get('/api/my-assignments', authenticate, requireRole('student'), studentAssignmentController.listMine);
router.get('/api/assignment-deliveries/:id', authenticate, requireRole('student'), studentAssignmentController.getDelivery);
router.post('/api/assignment-deliveries/:id/submit', authenticate, requireRole('student'), studentAssignmentController.submit);
router.get('/api/submissions/:id/regrade', authenticate, requireRole('student'), studentAssignmentController.prepareRegrade);
router.post('/api/submissions/:id/regrade', authenticate, requireRole('student'), studentAssignmentController.completeRegrade);

// Competency routes (teacher only)
router.get('/api/competencies', authenticate, requireRole('teacher'), competencyController.listFramework);
router.post('/api/competencies', authenticate, requireRole('teacher'), [
  body('name').trim().isLength({ min: 3, max: 160 }).withMessage('TÃªn ká»¹ nÄƒng khÃ´ng há»£p lá»‡'),
  body('description').trim().isLength({ min: 10 }).withMessage('MÃ´ táº£ ká»¹ nÄƒng quÃ¡ ngáº¯n'),
  body('subject').equals('python').withMessage('Thá»­ nghiá»‡m hiá»‡n chá»‰ há»— trá»£ Python'),
  body('grade').equals('10').withMessage('Thá»­ nghiá»‡m hiá»‡n chá»‰ há»— trá»£ khá»‘i 10'),
  validate,
], competencyController.createCustomCompetency);
router.patch('/api/competencies/:competencyId', authenticate, requireRole('teacher'), competencyController.updateCustomCompetency);
router.get('/api/assignments/:assignmentId/competencies', authenticate, requireRole('teacher'), competencyController.getAssignmentMappings);
router.put('/api/assignments/:assignmentId/competencies', authenticate, requireRole('teacher'), [
  body('mappings').isArray().withMessage('Danh sÃ¡ch ká»¹ nÄƒng khÃ´ng há»£p lá»‡'),
  body('mappings.*.competency_id').isUUID().withMessage('Ká»¹ nÄƒng khÃ´ng há»£p lá»‡'),
  body('mappings.*.difficulty').isInt({ min: 1, max: 5 }).withMessage('Äá»™ khÃ³ pháº£i tá»« 1 Ä‘áº¿n 5'),
  body('mappings.*.weight').isFloat({ gt: 0, max: 10 }).withMessage('Trá»ng sá»‘ khÃ´ng há»£p lá»‡'),
  body('mappings.*.status').isIn(['proposed', 'approved', 'rejected']).withMessage('Tráº¡ng thÃ¡i khÃ´ng há»£p lá»‡'),
  validate,
], competencyController.replaceAssignmentMappings);
router.post('/api/classes/:id/competencies/calculate', authenticate, requireRole('teacher'), competencyController.calculateClassSnapshots);
router.get('/api/classes/:id/competencies', authenticate, requireRole('teacher'), competencyController.getClassDashboard);
router.get('/api/classes/:id/students/:studentId/competencies', authenticate, requireRole('teacher'), competencyController.getStudentProfile);

// Student analysis routes (teacher only)
router.post('/api/classes/:id/students/:studentId/ai-analysis/preview', authenticate, requireRole('teacher'), requireAIAdmin, [
  body('scope').optional().isObject().withMessage('Phạm vi không hợp lệ'),
  body('scope.mode').optional().isIn(['latest', 'dates']).withMessage('Chế độ không hợp lệ'),
  body('scope.limit').optional().isIn([3, 5, 10]).withMessage('Số bài phải là 3, 5 hoặc 10'),
  body('scope.from').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Ngày bắt đầu không hợp lệ'),
  body('scope.to').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Ngày kết thúc không hợp lệ'),
  body('confirm_sparse_data').optional().isBoolean().withMessage('Xác nhận dữ liệu thưa phải là boolean'),
  validate,
], studentAnalysisController.preview);
router.post('/api/classes/:id/students/:studentId/ai-analysis/jobs', authenticate, requireRole('teacher'), requireAIAdmin, [
  body('scope').optional().isObject().withMessage('Phạm vi không hợp lệ'),
  body('scope.mode').optional().isIn(['latest', 'dates']).withMessage('Chế độ không hợp lệ'),
  body('scope.limit').optional().isIn([3, 5, 10]).withMessage('Số bài phải là 3, 5 hoặc 10'),
  body('scope.from').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Ngày bắt đầu không hợp lệ'),
  body('scope.to').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Ngày kết thúc không hợp lệ'),
  body('confirm_sparse_data').optional().isBoolean().withMessage('Xác nhận dữ liệu thưa phải là boolean'),
  validate,
], studentAnalysisController.createJob);
router.get('/api/classes/:id/students/:studentId/ai-analysis/jobs/:jobId', authenticate, requireRole('teacher'), studentAnalysisController.getJob);
router.get('/api/classes/:id/students/:studentId/ai-analysis/reports', authenticate, requireRole('teacher'), studentAnalysisController.listReports);
router.get('/api/classes/:id/students/:studentId/ai-analysis/reports/:reportId', authenticate, requireRole('teacher'), studentAnalysisController.getReport);
router.patch('/api/classes/:id/students/:studentId/ai-analysis/reports/:reportId/review', authenticate, requireRole('teacher'), [
  body('decision').isIn(['approved_internal', 'published', 'rejected']).withMessage('Quyết định không hợp lệ'),
  body('teacher_report').optional().isObject().withMessage('Báo cáo giáo viên không hợp lệ'),
  body('student_report').optional().isObject().withMessage('Báo cáo học sinh không hợp lệ'),
  body('instruction').optional().isString().isLength({ max: 2000 }).withMessage('Chỉ dẫn tối đa 2000 ký tự'),
  validate,
], studentAnalysisController.reviewReport);
router.post('/api/classes/:id/students/:studentId/ai-analysis/jobs/:jobId/retry', authenticate, requireRole('teacher'), requireAIAdmin, studentAnalysisController.retryJob);



// Assignment routes
router.post('/api/ai/assignment-drafts', authenticate, requireRole('teacher'), requireAIAdmin, [
  body('request').trim().isLength({ min: 1, max: 12000 }).withMessage('Yêu cầu phải từ 1-12000 ký tự'),
  body('subject').optional().isIn(['python', 'sql', 'html']).withMessage('Môn không hợp lệ'),
  body('difficulty').optional().isInt({ min: 1, max: 5 }).withMessage('Độ khó phải từ 1-5'),
  validate,
], aiAssignmentController.generateDraft);
router.post('/api/assignments/:assignmentId/ai-competencies', authenticate, requireRole('teacher'), requireAIAdmin, [
  body('suggestions').isArray({ max: 20 }).withMessage('Danh sách năng lực không hợp lệ'), validate,
], aiAssignmentController.saveProposedCompetencies);

router.post('/api/assignments', authenticate, requireRole('teacher'), [
  body('class_id').notEmpty().withMessage('class_id khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng'),
  body('title').trim().notEmpty().withMessage('TiÃªu Ä‘á»  khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng'),
  body('type').isIn(['python', 'sql', 'html']).withMessage('Loáº¡i bÃ i táº­p khÃ´ng há»£p lá»‡'),
  validate,
], assignmentController.create);

router.patch('/api/assignments/:id', authenticate, requireRole('teacher'), assignmentController.update);
router.post('/api/assignments/:id/test-cases', authenticate, requireRole('teacher'), assignmentController.addTestCases);
router.patch('/api/assignments/:id/publish', authenticate, requireRole('teacher'), assignmentController.togglePublish);
router.get('/api/assignments/:id', authenticate, assignmentController.getDetail);
router.get('/api/classes/:id/assignments', authenticate, assignmentController.getClassAssignments);
router.post('/api/classes/:id/assignments/share', authenticate, requireRole('teacher'), assignmentController.shareAssignments);

// Submission routes
router.post('/api/submit', authenticate, [
  body('assignment_id').notEmpty().withMessage('assignment_id khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng'),
  body('code').notEmpty().withMessage('Code khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng'),
  body('results').isArray().withMessage('results pháº£i lÃ  máº£ng'),
  validate,
], submissionController.submit);

router.get('/api/submissions/my/:assignment_id', authenticate, submissionController.getMySubmission);

// Stats routes
router.get('/api/stats', authenticate, statsController.getStats);
router.get('/api/stats/top-rank', authenticate, requireRole('teacher'), statsController.getTopRank);

// Gradebook routes
router.get('/api/classes/:id/gradebook', authenticate, requireRole('teacher'), submissionController.getGradebook);
router.get('/api/classes/:id/gradebook/export', authenticate, requireRole('teacher'), submissionController.exportGradebook);
router.get('/api/classes/:id/submissions/:submissionId', authenticate, requireRole('teacher'), submissionController.getSubmissionForTeacher);

export default router;
