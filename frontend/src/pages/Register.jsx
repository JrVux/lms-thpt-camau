import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const validate = (values) => {
  const errors = {};
  if (!values.full_name.trim()) errors.full_name = 'Vui lòng nhập họ tên';
  if (!values.username.trim()) errors.username = 'Vui lòng nhập tên đăng nhập';
  if (!values.password) {
    errors.password = 'Vui lòng nhập mật khẩu';
  } else if (values.password.length < 6) {
    errors.password = 'Mật khẩu phải có ít nhất 6 ký tự';
  }
  if (!values.role) errors.role = 'Vui lòng chọn vai trò';
  return errors;
};

const Register = () => {
  const { register, loading } = useAuth();
  const [form, setForm] = useState({
    full_name: '', username: '', password: '', role: 'student',
  });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: '' });
    setApiError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    try {
      await register(form);
    } catch (err) {
      setApiError(err.response?.data?.message || 'Đăng ký thất bại');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#2563EB]">LMS THPT</h1>
          <p className="text-gray-500 mt-1">Tạo tài khoản mới</p>
        </div>

        {apiError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Họ và tên</label>
            <input
              type="text"
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              className={`w-full px-4 py-2.5 border rounded-lg outline-none transition-colors focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] ${
                errors.full_name ? 'border-red-400' : 'border-gray-300'
              }`}
              placeholder="Nguyễn Văn A"
            />
            {errors.full_name && <p className="mt-1 text-sm text-red-500">{errors.full_name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              className={`w-full px-4 py-2.5 border rounded-lg outline-none transition-colors focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] ${
                errors.username ? 'border-red-400' : 'border-gray-300'
              }`}
              placeholder="nguyenvan_a"
            />
            {errors.username && <p className="mt-1 text-sm text-red-500">{errors.username}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className={`w-full px-4 py-2.5 border rounded-lg outline-none transition-colors focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] ${
                errors.password ? 'border-red-400' : 'border-gray-300'
              }`}
              placeholder="Ít nhất 6 ký tự"
            />
            {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vai trò</label>
            <div className="flex gap-4">
              {['student', 'teacher'].map((r) => (
                <label
                  key={r}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg cursor-pointer transition-colors ${
                    form.role === r
                      ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={form.role === r}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  {r === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                </label>
              ))}
            </div>
            {errors.role && <p className="mt-1 text-sm text-red-500">{errors.role}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#2563EB] hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-lg transition-colors mt-6"
          >
            {loading ? 'Đang đăng ký...' : 'Đăng ký'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Đã có tài khoản?{' '}
          <Link to="/login" className="text-[#2563EB] font-medium hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
