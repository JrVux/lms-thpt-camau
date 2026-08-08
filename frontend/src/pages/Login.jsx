import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GraduationCap, Loader2, AlertCircle } from 'lucide-react';

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

const inputClass = (hasError) =>
  `w-full px-4 py-2.5 border rounded-lg outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand ${
    hasError ? 'border-red-400' : 'border-brand-border'
  }`;

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
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-card">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-sm">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-heading">LMS THPT</h1>
          <p className="mt-1 text-sm text-brand-muted">Hệ thống quản lý lớp học trực tuyến</p>
        </div>

        {apiError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-badge-red-bg p-3 text-sm text-badge-red-text">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-heading">Email / Tên đăng nhập</label>
            <input
              type="text"
              name="credential"
              value={form.credential}
              onChange={handleChange}
              className={inputClass(errors.credential)}
              placeholder="email hoặc tên đăng nhập"
            />
            {errors.credential && <p className="mt-1 text-sm text-red-500">{errors.credential}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-heading">Mật khẩu</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className={inputClass(errors.password)}
              placeholder="••••••"
            />
            {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-brand-muted">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="font-medium text-brand hover:underline">
            Đăng ký ngay
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;