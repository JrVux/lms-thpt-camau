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

### Backend lên Railway

1. Push code lên GitHub
2. Vào [Railway](https://railway.app) → New Project → Deploy from GitHub
3. Add các biến môi trường (xem `.env.example`)
4. Deploy tự động, Railway tự detect `Procfile`
5. Copy domain `.railway.app` để dùng cho frontend

### Frontend lên Vercel

1. Push code lên GitHub
2. Vào [Vercel](https://vercel.com) → Add New Project
3. Import GitHub repo, chọn folder frontend
4. **Framework Preset:** Vite
5. **Build Command:** `npm run build`
6. **Output Directory:** `dist`
7. Thêm environment variable: `VITE_API_URL` = backend URL (Railway domain)
8. Deploy

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
