import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

// Middleware xác thực JWT từ header Authorization: Bearer <token>
export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Thiếu token xác thực' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token đã hết hạn' });
    }
    return res.status(401).json({ message: 'Token không hợp lệ' });
  }
};

// Middleware kiểm tra role, trả về middleware tương ứng
export const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Chưa xác thực' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện hành động này' });
    }
    next();
  };
};

// Middleware kiểm tra quyền admin sử dụng AI
export const requireAIAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Chưa xác thực' });
  }

  const allowedConfig = process.env.AI_ADMIN_USERS || process.env.AI_ADMIN_EMAIL || process.env.AI_ADMIN_USERNAME;
  if (!allowedConfig || allowedConfig.trim() === '' || allowedConfig.trim() === '*') {
    return next();
  }

  const allowedList = allowedConfig
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const userEmail = (req.user.email || '').toLowerCase();
  const username = (req.user.username || '').toLowerCase();
  const userId = (req.user.id || '').toLowerCase();

  const isAllowed = allowedList.some((allowed) =>
    allowed === userEmail || allowed === username || allowed === userId
  );

  if (!isAllowed) {
    return res.status(403).json({
      message: 'Tính năng AI chỉ dành riêng cho tài khoản Quản trị viên (Admin). Các tài khoản giáo viên khác không được phép sử dụng.',
      code: 'AI_ACCESS_DENIED'
    });
  }

  next();
};
