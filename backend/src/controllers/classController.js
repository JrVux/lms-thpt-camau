import * as classService from '../services/classService.js';

// POST /api/classes - Tạo lớp mới (chỉ teacher)
export const create = async (req, res) => {
  try {
    const { name, grade } = req.body;

    if (!name || !grade) {
      return res.status(400).json({ message: 'Vui lòng nhập tên lớp và khối lớp' });
    }

    const newClass = await classService.createClass({ name, grade }, req.user.id);
    return res.status(201).json(newClass);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// GET /api/classes - Lấy danh sách lớp
export const list = async (req, res) => {
  try {
    const classes = await classService.getClasses(req.user.id, req.user.role);
    return res.json(classes);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// POST /api/classes/join - Tham gia lớp bằng mã
export const join = async (req, res) => {
  try {
    const { class_code } = req.body;

    if (!class_code) {
      return res.status(400).json({ message: 'Vui lòng nhập mã lớp' });
    }

    const result = await classService.joinClass(class_code, req.user.id);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// GET /api/classes/:id/students - Xem danh sách học sinh (chỉ teacher)
export const getStudents = async (req, res) => {
  try {
    const { id } = req.params;
    const students = await classService.getStudents(id, req.user.id);
    return res.json(students);
  } catch (error) {
    return res.status(403).json({ message: error.message });
  }
};

// POST /api/classes/:id/students - Thêm học sinh
export const addStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await classService.addStudent(id, req.user.id, req.body);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// PATCH /api/classes/:id/students/:userId - Cập nhật thông tin
export const updateStudent = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const result = await classService.updateStudent(id, req.user.id, userId, req.body);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// DELETE /api/classes/:id/students/:userId - Xóa học sinh
export const removeStudent = async (req, res) => {
  try {
    const { id, userId } = req.params;
    await classService.removeStudent(id, req.user.id, userId);
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// POST /api/classes/:id/students/reset-password - Reset mật khẩu
export const resetStudentPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, new_password } = req.body;
    if (!user_id || !new_password) {
      return res.status(400).json({ message: 'Vui lòng cung cấp user_id và new_password' });
    }
    await classService.resetStudentPassword(id, req.user.id, user_id, new_password);
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// POST /api/classes/:id/students/bulk-import - Import danh sách
export const bulkImportStudents = async (req, res) => {
  try {
    const { id } = req.params;
    const { students } = req.body;
    const result = await classService.bulkImportStudents(id, req.user.id, students);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// GET /api/students/search - Tìm kiếm học sinh
export const searchStudents = async (req, res) => {
  try {
    const { q } = req.query;
    const result = await classService.searchStudents(req.user.id, q);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// POST /api/classes/:id/students/enroll - Ghi danh học sinh đã có tài khoản
export const enrollExistingStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ message: 'Vui lòng cung cấp user_id' });
    const result = await classService.enrollExistingStudent(id, req.user.id, user_id);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// GET /api/students/unassigned - Học sinh chưa có lớp
export const getUnassignedStudents = async (req, res) => {
  try {
    const result = await classService.getUnassignedStudents();
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// DELETE /api/students/:userId - Xóa tài khoản học sinh
export const deleteStudentAccount = async (req, res) => {
  try {
    const { userId } = req.params;
    await classService.deleteStudentAccount(req.user.id, userId);
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
