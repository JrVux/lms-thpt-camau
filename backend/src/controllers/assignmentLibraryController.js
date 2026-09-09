import { supabase } from '../services/supabaseClient.js';
import { createAssignmentLibraryService } from '../services/assignmentLibraryService.js';
import { validateFileAssignment } from '../services/fileAssignmentRules.js';

const service = createAssignmentLibraryService(supabase);
const CATEGORIES = ['grade_10', 'grade_11', 'grade_12', 'advanced'];
const TYPES = ['python', 'sql', 'html'];
const TOPIC_NAME_MAX = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_STATE_FIELDS = new Set(['submission_type', 'essay_content', 'allowed_mime_types', 'max_file_size_mb', 'allow_late_submission', 'ai_grading_enabled', 'essay_model_answer', 'essay_rubric', 'show_model_answer_after_publish', 'max_score']);

const validationMessage = (input, requireAll = false) => {
  const fileError = validateFileAssignment(input);
  if (fileError) return fileError;

  if ((requireAll || input.category !== undefined) && !CATEGORIES.includes(input.category)) {
    return 'Nhóm bài tập không hợp lệ.';
  }
  if ((requireAll || input.type !== undefined) && !TYPES.includes(input.type)) {
    return 'Loại bài tập không hợp lệ.';
  }
  if (input.topic_id !== undefined && input.topic_id !== null && input.topic_id !== ''
    && !UUID_PATTERN.test(input.topic_id)) {
    return 'Chủ đề không hợp lệ.';
  }
  if (requireAll && !String(input.title ?? '').trim()) {
    return 'Tiêu đề bài tập không được để trống.';
  }
  return null;
};

const topicName = (raw) => String(raw ?? '').trim();

const failure = (res, error) => {
  const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : 400;
  return res.status(status).json({ message: error.message });
};

export const list = async (req, res) => {
  try {
    const { category, topicId } = req.query;
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Nhóm bài tập không hợp lệ.' });
    }
    if (topicId && !UUID_PATTERN.test(topicId)) {
      return res.status(400).json({ message: 'Chủ đề không hợp lệ.' });
    }
    return res.json(await service.list({ teacherId: req.user.id, category, topicId }));
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
  try {
    const current = await service.get({ teacherId: req.user.id, assignmentId: req.params.id });
    const merged = { ...current, ...req.body };
    const message = validationMessage(merged);
    if (message) return res.status(400).json({ message });
    const touchesFileState = Object.keys(req.body).some((field) => FILE_STATE_FIELDS.has(field));
    const input = touchesFileState ? {
      ...req.body,
      submission_type: merged.submission_type,
      essay_content: merged.essay_content,
      allowed_mime_types: merged.allowed_mime_types,
      max_file_size_mb: merged.max_file_size_mb,
      allow_late_submission: merged.allow_late_submission,
      ai_grading_enabled: merged.ai_grading_enabled,
      essay_model_answer: merged.essay_model_answer,
      essay_rubric: merged.essay_rubric,
      show_model_answer_after_publish: merged.show_model_answer_after_publish,
      max_score: merged.max_score,
    } : req.body;
    return res.json(await service.update({
      teacherId: req.user.id,
      assignmentId: req.params.id,
      input,
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

export const listTopics = async (req, res) => {
  try {
    const { category } = req.query;
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Nhóm bài tập không hợp lệ.' });
    }
    return res.json(await service.listTopics({ teacherId: req.user.id, category }));
  } catch (error) {
    return failure(res, error);
  }
};

export const createTopic = async (req, res) => {
  const name = topicName(req.body.name);
  if (!name) {
    return res.status(400).json({ message: 'Tên chủ đề không được để trống.' });
  }
  if (name.length > TOPIC_NAME_MAX) {
    return res.status(400).json({ message: `Tên chủ đề tối đa ${TOPIC_NAME_MAX} ký tự.` });
  }
  if (!CATEGORIES.includes(req.body.category)) {
    return res.status(400).json({ message: 'Nhóm bài tập không hợp lệ.' });
  }
  try {
    return res.status(201).json(await service.createTopic({
      teacherId: req.user.id,
      category: req.body.category,
      name,
    }));
  } catch (error) {
    return failure(res, error);
  }
};

export const updateTopic = async (req, res) => {
  const name = topicName(req.body.name);
  if (!name) {
    return res.status(400).json({ message: 'Tên chủ đề không được để trống.' });
  }
  if (name.length > TOPIC_NAME_MAX) {
    return res.status(400).json({ message: `Tên chủ đề tối đa ${TOPIC_NAME_MAX} ký tự.` });
  }
  try {
    return res.json(await service.renameTopic({
      teacherId: req.user.id,
      topicId: req.params.id,
      name,
    }));
  } catch (error) {
    return failure(res, error);
  }
};

export const deleteTopic = async (req, res) => {
  try {
    return res.json(await service.deleteTopic({
      teacherId: req.user.id,
      topicId: req.params.id,
    }));
  } catch (error) {
    return failure(res, error);
  }
};

export const remove = async (req, res) => {
  try {
    return res.json(await service.deleteAssignment({
      teacherId: req.user.id,
      assignmentId: req.params.id,
      libraryOnly: true,
    }));
  } catch (error) {
    return failure(res, error);
  }
};
