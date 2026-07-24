# LMS THPT - Hệ thống quản lý lớp học

Hệ thống quản lý lớp học cho trường THPT với 3 môn: Python, SQL, HTML. Học sinh code trực tiếp trên trình duyệt, chấm điểm tự động.

## Tech Stack

- **Frontend:** React 18 + Vite + TailwindCSS + Monaco Editor
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (Supabase)
- **Code Runner:** Pyodide (Python), sql.js (SQL), DOMParser (HTML) — chạy trên browser

## Cấu trúc thư mục

```
project/
├── backend/           # Express API server
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── database/
│   │   └── app.js
│   ├── package.json
│   ├── Procfile
│   └── .env.example
├── frontend/          # React + Vite client
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── contexts/
│   │   ├── services/
│   │   ├── workers/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── vercel.json
│   └── .env.example
└── README.md
```

## Cài đặt local

### Yêu cầu
- Node.js 18+
- Supabase account (free tier)

### Backend

```bash
cd backend
cp .env.example .env
# Điền SUPABASE_URL, SUPABASE_ANON_KEY, JWT_SECRET vào .env
npm install
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env
# Điền VITE_API_URL=http://localhost:3001
npm install
npm run dev
```

### Database
Chạy file `backend/src/database/schema.sql` trong Supabase SQL Editor.

## Deploy

### Backend — Cách 1 (khuyên dùng): Fly.io (miễn phí, không ngủ)

Fly.io free tier: **3 VM luôn chạy 24/7**, 256MB RAM mỗi VM, 160GB egress/tháng.

```bash
# Đăng ký Fly.io
fly auth signup

# Deploy
fly launch --copy-config --no-deploy
fly secrets set SUPABASE_URL=... SUPABASE_ANON_KEY=... JWT_SECRET=... CORS_ORIGIN=https://your-app.vercel.app
fly deploy

# Scale xuống free tier (1 shared VM)
fly scale vm shared-cpu-1x --memory 256
fly scale count 1
```

Sau deploy xong, chạy:
```bash
fly open   # copy domain để dùng cho frontend
```

### Backend — Cách 2: Render (free, có ngủ sau 15 phút)

1. Push code lên GitHub
2. Vào [Render](https://render.com) → New Web Service → Connect repo
3. Render tự detect `render.yaml` → Blueprint → Deploy
4. Vào Dashboard → set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `JWT_SECRET`
5. Copy domain `.onrender.com` để dùng cho frontend

> ⚠ Render free: 750h/tháng (~31 ngày). Dùng cron-job.org ping mỗi 10 ph để tránh sleep.

### Frontend lên Vercel

1. Push code lên GitHub
2. Vào [Vercel](https://vercel.com) → Add New Project
3. Import GitHub repo, chọn folder `frontend`
4. **Framework Preset:** Vite
5. **Build Command:** `npm run build`
6. **Output Directory:** `dist`
7. Thêm environment variable: `VITE_API_URL` = backend URL (Fly.io hoặc Render domain)
8. Deploy

### Giữ Supabase free project không bị pause

Supabase free project bị pause sau **7 ngày không hoạt động**. Để tránh:

**Cách A — Dùng cron-job.org (miễn phí):**
1. Vào [cron-job.org](https://cron-job.org) → Đăng ký
2. Tạo job:
   - **URL:** `https://sfanqrirgbxpgrhcamit.supabase.co/rest/v1/`
   - **Interval:** Every 5 days
   - **Method:** GET
3. Thêm job thứ 2:
   - **URL:** `https://lms-thpt-camau.onrender.com/health` (backen‌d URL của bạn)
   - **Interval:** Every 10 minutes
   - **Method:** GET

**Cách B — Dùng GitHub Actions (có sẵn trong repo):**
Chạy script `node backend/scripts/keep-alive.mjs` trên GitHub Actions mỗi 5 ngày.

## Checklist kiểm tra trước khi dùng

- [ ] Đăng ký tài khoản teacher thành công
- [ ] Tạo lớp 10, 11, 12 với mã lớp
- [ ] Học sinh đăng ký và join lớp bằng mã
- [ ] Tạo bài Python với 3 test cases, học sinh làm và nộp có điểm
- [ ] Tạo bài SQL với setup_sql, học sinh chạy query và nộp
- [ ] Tạo bài HTML với selector test, học sinh code và nộp
- [ ] Gradebook hiện đúng điểm tất cả học sinh
- [ ] Xuất CSV điểm về máy
- [ ] Test trên điện thoại (responsive)

## API Endpoints

| Method | Endpoint | Auth | Role |
|--------|----------|------|------|
| POST | /api/register | - | - |
| POST | /api/login | - | - |
| POST | /api/classes | JWT | teacher |
| GET | /api/classes | JWT | all |
| POST | /api/classes/join | JWT | student |
| GET | /api/classes/:id/students | JWT | teacher |
| POST | /api/assignments | JWT | teacher |
| GET | /api/assignments/:id | JWT | all |
| PATCH | /api/assignments/:id/publish | JWT | teacher |
| POST | /api/assignments/:id/test-cases | JWT | teacher |
| GET | /api/classes/:id/assignments | JWT | all |
| POST | /api/submit | JWT | all |
| GET | /api/submissions/my/:assignment_id | JWT | all |
| GET | /api/classes/:id/gradebook | JWT | teacher |
| GET | /api/classes/:id/gradebook/export | JWT | teacher |
