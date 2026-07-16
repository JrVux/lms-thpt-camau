import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { supabase } from './supabaseClient.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const SALT_ROUNDS = 12;

// Tạo JWT token với thời hạn 7 ngày
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Đăng ký người dùng mới
export const register = async ({ username, email, password, full_name, role }) => {
  // Kiểm tra username đã tồn tại
  const { data: existingUsername } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (existingUsername) {
    throw new Error('Tên đăng nhập đã tồn tại');
  }

  // Tự động tạo email nếu không được cung cấp
  if (!email) {
    email = `${username}@lms.local`;
  }

  // Kiểm tra email đã tồn tại
  const { data: existingEmail } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingEmail) {
    throw new Error('Email đã được sử dụng');
  }

  // Hash password
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  // Lưu vào database
  const { data: user, error } = await supabase
    .from('users')
    .insert([{ username, email, password_hash, full_name, role }])
    .select('id, username, email, full_name, role, created_at')
    .single();

  if (error) {
    throw new Error('Đăng ký thất bại: ' + error.message);
  }

  const token = generateToken(user);

  return { token, user };
};

// Đăng nhập
export const login = async (credential, password) => {
  // Tìm user theo email hoặc username
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .or(`email.eq.${credential},username.eq.${credential}`)
    .single();

  if (error || !user) {
    throw new Error('Email/tên đăng nhập hoặc mật khẩu không đúng');
  }

  // So sánh password
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new Error('Email hoặc mật khẩu không đúng');
  }

  const token = generateToken(user);

  // Trả về thông tin user (không bao gồm password_hash)
  const { password_hash, ...userInfo } = user;

  return { token, user: userInfo };
};
