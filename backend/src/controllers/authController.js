import * as authService from '../services/authService.js';

export const register = async (req, res, next) => {
  try {
    const { username, email, password, full_name, role, teacher_secret } = req.body;
    const userRole = role === 'teacher' ? 'teacher' : 'student';

    const result = await authService.register({ username, email, password, full_name, role: userRole, teacher_secret });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message, code: 'REGISTER_ERROR' });
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, username, password } = req.body;
    const credential = email || username;
    if (!credential) return res.status(400).json({ message: 'Vui lòng nhập email hoặc tên đăng nhập' });
    const result = await authService.login(credential, password);
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(401).json({ success: false, message: error.message, code: 'LOGIN_ERROR' });
  }
};
