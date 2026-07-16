import * as assignmentService from '../services/assignmentService.js';

// POST /api/assignments - Tạo bài tập mới
export const create = async (req, res) => {
  try {
    const { class_id, title, description, type, starter_code, solution_code, due_date } = req.body;

    if (!class_id || !title || !type) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin (class_id, title, type)' });
    }

    if (!['python', 'sql', 'html'].includes(type)) {
      return res.status(400).json({ message: 'Loại bài tập phải là python, sql hoặc html' });
    }

    const assignment = await assignmentService.createAssignment(
      { class_id, title, description, type, starter_code, solution_code, due_date },
      req.user.id
    );

    return res.status(201).json(assignment);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// POST /api/assignments/:id/test-cases - Thêm test cases
export const addTestCases = async (req, res) => {
  try {
    const { id } = req.params;
    const { test_cases } = req.body;

    if (!test_cases || !Array.isArray(test_cases) || test_cases.length === 0) {
      return res.status(400).json({ message: 'Vui lòng cung cấp danh sách test cases' });
    }

    for (const tc of test_cases) {
      if (!tc.expected_output) {
        return res.status(400).json({ message: 'Mỗi test case phải có expected_output' });
      }
    }

    const result = await assignmentService.upsertTestCases(id, test_cases, req.user.id);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// GET /api/assignments/:id - Lấy chi tiết bài tập
export const getDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await assignmentService.getAssignment(id, req.user.id, req.user.role);
    return res.json(assignment);
  } catch (error) {
    return res.status(404).json({ message: error.message });
  }
};

// PATCH /api/assignments/:id/publish - Publish / unpublish
export const togglePublish = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await assignmentService.togglePublish(id, req.user.id);
    return res.json(updated);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// PATCH /api/assignments/:id - Cập nhật bài tập
export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await assignmentService.updateAssignment(id, req.body, req.user.id);
    return res.json(updated);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// POST /api/classes/:id/assignments/share - Chia sẻ bài tập sang lớp khác
export const shareAssignments = async (req, res) => {
  try {
    const { id } = req.params;
    const { target_class_ids, assignment_ids } = req.body;
    if (!target_class_ids || !Array.isArray(target_class_ids) || target_class_ids.length === 0) {
      return res.status(400).json({ message: 'Vui lòng chọn lớp đích' });
    }
    const result = await assignmentService.shareAssignments(id, target_class_ids, assignment_ids, req.user.id);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// GET /api/classes/:id/assignments - Lấy bài tập của lớp
export const getClassAssignments = async (req, res) => {
  try {
    const { id } = req.params;
    const assignments = await assignmentService.getClassAssignments(id, req.user.id, req.user.role);
    return res.json(assignments);
  } catch (error) {
    return res.status(403).json({ message: error.message });
  }
};
