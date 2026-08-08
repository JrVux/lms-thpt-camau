import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GraduationCap, Loader2, AlertCircle } from 'lucide-react';

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
  if (values.role === 'teacher' && !values.teacher_secret.trim()) {
    errors.teacher_secret = 'Vui lòng nhập mã giáo viên';
  }
  return errors;
};

const inputClass = (hasError) =>
  `w-full px-4 py-2.5 border rounded-lg outline-none transition-colors focus:ring-2 focus:ring-brand/20 focus:border-brand ${
    hasError ? 'border-red-400' : 'border-brand-border'
  }`;

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
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-card">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-sm">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-heading">LMS THPT</h1>
          <p className="mt-1 text-sm text-brand-muted">Tạo tài khoản mới</p>
        </div>

        {apiError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-badge-red-bg p-3 text-sm text-badge-red-text">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-heading">Họ và tên</label>
            <input
              type="text"
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              className={inputClass(errors.full_name)}
              placeholder="Nguyễn Văn A"
            />
            {errors.full_name && <p className="mt-1 text-sm text-red-500">{errors.full_name}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-heading">Tên đăng nhập</label>
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              className={inputClass(errors.username)}
              placeholder="nguyenvan_a"
            />
            {errors.username && <p className="mt-1 text-sm text-red-500">{errors.username}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-heading">Mật khẩu</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className={inputClass(errors.password)}
              placeholder="Ít nhất 6 ký tự"
            />
            {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-heading">Vai trò</label>
            <div className="flex gap-4">
              {['student', 'teacher'].map((r) => (
                <label
                  key={r}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2.5 transition-colors ${
                    form.role === r
                      ? 'border-brand bg-brand-light text-brand'
                      : 'border-brand-border text-brand-body hover:border-gray-400'
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

          {form.role === 'teacher' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-heading">Mã giáo viên</label>
              <input
                type="password"
                name="teacher_secret"
                value={form.teacher_secret || ''}
                onChange={handleChange}
                className={inputClass(errors.teacher_secret)}
                placeholder="nhập mã bí mật"
              />
              {errors.teacher_secret && <p className="mt-1 text-sm text-red-500">{errors.teacher_secret}</p>}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Đang đăng ký...' : 'Đăng ký'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-brand-muted">
          Đã có tài khoản?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;