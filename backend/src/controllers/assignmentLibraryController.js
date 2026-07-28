import { supabase } from '../services/supabaseClient.js';
import { createAssignmentLibraryService } from '../services/assignmentLibraryService.js';

const service = createAssignmentLibraryService(supabase);
const CATEGORIES = ['grade_10', 'grade_11', 'grade_12', 'advanced'];
const TYPES = ['python', 'sql', 'html'];

const validationMessage = (input, requireAll = false) => {
  if ((requireAll || input.category !== undefined) && !CATEGORIES.includes(input.category)) {
    return 'Nhóm bài tập không hợp lệ.';
  }
  if ((requireAll || input.type !== undefined) && !TYPES.includes(input.type)) {
    return 'Loại bài tập không hợp lệ.';
  }
  if (requireAll && !String(input.title ?? '').trim()) {
    return 'Tiêu đề bài tập không được để trống.';
  }
  return null;
};

const failure = (res, error) =>
  res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({ message: error.message });

export const list = async (req, res) => {
  try {
    const category = req.query.category;
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Nhóm bài tập không hợp lệ.' });
    }
    return res.json(await service.list({ teacherId: req.user.id, category }));
  } catch (error) {
    return failure(res, error);
  }
};

export const create = async (req, res) => {
  const message = validationMessage(req.body, true);
  if (message) return res.status(400).json({ message });
  try {
    const assignment = await service.create({ teacherId: req.user.id, input: req.body });
    return res.status(201).json(assignment);
  } catch (error) {
    return failure(res, error);
  }
};

export const get = async (req, res) => {
  try {
    return res.json(await service.get({
      teacherId: req.user.id,
      assignmentId: req.params.id,
    }));
  } catch (error) {
    return failure(res, error);
  }
};

export const update = async (req, res) => {
  const message = validationMessage(req.body);
  if (message) return res.status(400).json({ message });
  try {
    return res.json(await service.update({
      teacherId: req.user.id,
      assignmentId: req.params.id,
      input: req.body,
    }));
  } catch (error) {
    return failure(res, error);
  }
};

export const replaceTestCases = async (req, res) => {
  const testCases = req.body.test_cases;
  if (!Array.isArray(testCases)) {
    return res.status(400).json({ message: 'test_cases phải là một danh sách.' });
  }
  if (testCases.some((testCase) => testCase.expected_output === undefined)) {
    return res.status(400).json({ message: 'Mỗi test case phải có expected_output.' });
  }
  try {
    return res.json(await service.replaceTestCases({
      teacherId: req.user.id,
      assignmentId: req.params.id,
      testCases,
    }));
  } catch (error) {
    return failure(res, error);
  }
};
