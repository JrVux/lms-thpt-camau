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
    const allowedConfig = process.env.AI_ADMIN_USERS || process.env.AI_ADMIN_EMAIL || process.env.AI_ADMIN_USERNAME;
    const isAdmin = allowedConfig?.split(',').map(s => s.trim().toLowerCase()).some(a =>
      a === result.user?.email?.toLowerCase() || a === result.user?.username?.toLowerCase() || a === result.user?.id?.toLowerCase()
    ) || false;
    return res.json({ success: true, ...result, user: { ...result.user, is_admin: isAdmin } });
  } catch (error) {
    return res.status(401).json({ success: false, message: error.message, code: 'LOGIN_ERROR' });
  }
};
