import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as authController from '../controllers/authController.js';
import * as classController from '../controllers/classController.js';
import * as assignmentController from '../controllers/assignmentController.js';
import * as submissionController from '../controllers/submissionController.js';
import * as statsController from '../controllers/statsController.js';

const router = Router();

// Auth routes
router.post('/api/register', [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Tên đăng nhập phải từ 3-50 ký tự'),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail().withMessage('Email không hợp lệ'),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải có ít nhất 6 ký tự'),
  body('full_name').trim().notEmpty().withMessage('Họ tên không được để trống'),
  body('role').optional().isIn(['teacher', 'student']).withMessage('Vai trò không hợp lệ'),
  validate,
], authController.register);

router.post('/api/login', [
  body('password').notEmpty().withMessage('Mật khẩu không được để trống'),
  validate,
], authController.login);

// Class routes
router.post('/api/classes', authenticate, requireRole('teacher'), [
  body('name').trim().notEmpty().withMessage('Tên lớp không được để trống'),
  body('grade').isIn(['10', '11', '12']).withMessage('Khối lớp phải là 10, 11 hoặc 12'),
  validate,
], classController.create);

router.get('/api/classes', authenticate, classController.list);

router.post('/api/classes/join', authenticate, requireRole('student'), [
  body('class_code').trim().isLength({ min: 6, max: 6 }).withMessage('Mã lớp phải 6 ký tự'),
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

// Assignment routes
router.post('/api/assignments', authenticate, requireRole('teacher'), [
  body('class_id').notEmpty().withMessage('class_id không được để trống'),
  body('title').trim().notEmpty().withMessage('Tiêu đề không được để trống'),
  body('type').isIn(['python', 'sql', 'html']).withMessage('Loại bài tập không hợp lệ'),
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
  body('assignment_id').notEmpty().withMessage('assignment_id không được để trống'),
  body('code').notEmpty().withMessage('Code không được để trống'),
  body('results').isArray().withMessage('results phải là mảng'),
  validate,
], submissionController.submit);

router.get('/api/submissions/my/:assignment_id', authenticate, submissionController.getMySubmission);

// Stats routes
router.get('/api/stats', authenticate, statsController.getStats);
router.get('/api/stats/top-rank', authenticate, requireRole('teacher'), statsController.getTopRank);

// Gradebook routes
router.get('/api/classes/:id/gradebook', authenticate, requireRole('teacher'), submissionController.getGradebook);
router.get('/api/classes/:id/gradebook/export', authenticate, requireRole('teacher'), submissionController.exportGradebook);

export default router;
