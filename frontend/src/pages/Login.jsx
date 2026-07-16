import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const validate = (values) => {
  const errors = {};
  if (!values.credential.trim()) {
    errors.credential = 'Vui lòng nhập email hoặc tên đăng nhập';
  }
  if (!values.password) {
    errors.password = 'Vui lòng nhập mật khẩu';
  }
  return errors;
};

const Login = () => {
  const { login, loading } = useAuth();
  const [form, setForm] = useState({ credential: '', password: '' });
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
      await login(form.credential, form.password);
    } catch (err) {
      setApiError(err.response?.data?.message || 'Đăng nhập thất bại');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#2563EB]">LMS THPT</h1>
          <p className="text-gray-500 mt-1">Đăng nhập vào hệ thống</p>
        </div>

        {apiError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email / Tên đăng nhập</label>
            <input
              type="text"
              name="credential"
              value={form.credential}
              onChange={handleChange}
              className={`w-full px-4 py-2.5 border rounded-lg outline-none transition-colors focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] ${
                errors.credential ? 'border-red-400' : 'border-gray-300'
              }`}
              placeholder="email hoặc tên đăng nhập"
            />
            {errors.credential && <p className="mt-1 text-sm text-red-500">{errors.credential}</p>}
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
              placeholder="••••••"
            />
            {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#2563EB] hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="text-[#2563EB] font-medium hover:underline">
            Đăng ký ngay
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
