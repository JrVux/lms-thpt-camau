# LMS THPT Cà Mau

Nền tảng quản lý lớp học và thực hành lập trình dành cho THPT, với giao diện OmniRoute. Giáo viên giao bài Python, SQL, HTML; học sinh làm trực tiếp trên trình duyệt và nhận kết quả tự động.

[Mở hệ thống](https://frontend-alpha-henna-71.vercel.app) · [Cẩm nang HTML](docs/huong-dan-su-dung.html) · [Cẩm nang PDF](output/pdf/cam-nang-su-dung-lms-thpt.pdf)

> Tài liệu được đồng bộ với production commit `eaacd41` ngày 08/08/2026.

## Trợ lý soạn bài bằng AI

Backend cần các biến `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_REQUEST_TIMEOUT_MS=45000` và `AI_ASSIGNMENT_MAX_INPUT_CHARS=12000`. Không đặt khóa AI trong frontend.

OpenRouter được gọi trước; Gemini chỉ dự phòng khi lỗi kỹ thuật hoặc kết quả không hợp lệ. Giáo viên mở **Soạn bằng AI**, nhập yêu cầu hoặc bài mẫu, xác nhận môn được nhận diện rồi điền bản nháp vào biểu mẫu. AI không tự lưu hoặc giao bài. Các năng lực AI gợi ý luôn ở trạng thái chờ giáo viên duyệt. Bảng `ai_generation_logs` chỉ lưu metadata sử dụng, không lưu prompt hoặc Solution Code.

## Điểm nổi bật

### Dành cho giáo viên

- Quản lý lớp tại **Lớp của tôi**; tạo lớp theo khối 10/Python, 11/SQL và 12/HTML.
- Quản lý học sinh, nhập danh sách, cấp lại mật khẩu và mã lớp.
- Kho bài tập chia thành Khối 10, 11, 12 và Nâng cao.
- Sắp xếp bài trong Kho bài tập theo **chủ đề** riêng của từng khối (ví dụ Biến, Vòng lặp, Hàm); lọc nhanh theo chủ đề khi soạn và giao bài.
- Một bài Nâng cao vẫn thuộc một môn Python/SQL/HTML và chỉ giao cho lớp có môn tương ứng.
- Giao bài cho toàn lớp hoặc một nhóm học sinh cụ thể.
- Sao chép bài dưới dạng bản nháp độc lập để chỉnh riêng từng lớp, hoặc giữ liên kết đồng bộ.
- Khi nội dung dùng chung thay đổi, đánh dấu và chấm lại các bài đã nộp theo phiên bản mới.
- Xem bảng điểm, bấm vào điểm để đọc mã nguồn và kết quả từng test.
- Gắn kỹ năng đã duyệt cho bài/test và xem **Phân tích năng lực** theo lớp hoặc từng học sinh.
- Xuất bảng điểm CSV/Excel.
- Xóa lớp vĩnh viễn bằng bước nhập lại chính xác tên lớp; giữ tài khoản học sinh và bài gốc trong Kho bài tập.

### Dành cho học sinh

- Quản lý lớp tại **Lớp học**; đăng ký tài khoản và tham gia lớp bằng mã 6 ký tự.
- Chỉ nhìn thấy bài được giao cho mình.
- Theo dõi bài được giao tại **Bài tập của tôi**.
- Làm và chạy thử Python, SQL hoặc HTML ngay trên trình duyệt.
- Xem điểm, kết quả từng test, số lượt còn lại và làm lại khi được phép.
- Nhận trạng thái yêu cầu chấm lại khi giáo viên cập nhật bài dùng chung.

## Kiến trúc

| Thành phần | Công nghệ | Production |
|---|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Monaco Editor | [Vercel](https://frontend-alpha-henna-71.vercel.app) |
| Backend | Node.js, Express | [Render](https://lms-thpt-camau.onrender.com) |
| Database | PostgreSQL, Supabase | Server-only access |
| Chạy mã | Pyodide, sql.js, DOMParser | Trong trình duyệt |

Backend là lớp duy nhất truy cập Supabase bằng `service_role`. Frontend không chứa khóa đặc quyền.

## Chạy local

Yêu cầu Node.js 18+ và một project Supabase.

```bash
git clone https://github.com/JrVux/lms-thpt-camau.git
cd lms-thpt-camau
npm install
npm install --prefix backend
npm install --prefix frontend
```

Tạo `backend/.env`:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-key>
JWT_SECRET=<long-random-secret>
TEACHER_SECRET=<teacher-registration-code>
CORS_ORIGIN=http://localhost:5173
PORT=3001
NODE_ENV=development
```

Tạo `frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:3001
```

Khởi động:

```bash
npm run dev:backend
npm run dev:frontend
```

> Không commit `.env`, `TEACHER_SECRET`, JWT hoặc khóa `service_role`. Mã giáo viên production được quản trị viên lấy trong biến môi trường Render.

## Database

Với database mới, chạy `backend/src/database/schema.sql`, sau đó chạy lần lượt:

1. `001_add_max_submissions.sql`
2. `002_add_submission_results_columns.sql`
3. `003_add_indexes.sql`
4. `004_assignment_library_and_deliveries.sql`
5. `005_assignment_transactions.sql`
6. `006_lock_assignment_rpcs.sql`
7. `007_lock_legacy_tables.sql`
8. `008_delete_class_transaction.sql`
9. `009_competency_foundation.sql`
10. `010_ai_generation_logs.sql`
11. `011_student_ai_analysis.sql`
12. `012_assignment_topics.sql`

Các migration thiết lập Kho bài tập, bản giao theo lớp/học sinh, giao dịch nộp/chấm lại nguyên tử, khóa truy cập công khai, xóa lớp an toàn, nền tảng năng lực có phiên bản và chủ đề bài tập theo từng khối.

## Phân tích năng lực — thử nghiệm Python lớp 10

Giáo viên mở bài đã lưu để gắn kỹ năng cho toàn bài hoặc từng test, đặt độ khó/trọng số và duyệt mapping. Chỉ mapping **Đã duyệt** mới tạo bằng chứng. Trong lớp, tab **Phân tích năng lực** tính mức thành thạo, độ tin cậy và xu hướng từ lịch sử bài nộp; mọi bằng chứng đều liên kết tới bài nộp và test gốc.

Khi độ tin cậy dưới 40%, hệ thống hiển thị **Chưa đủ dữ liệu** thay vì kết luận học sinh yếu. Chỉ số được tính bằng quy tắc cố định; giai đoạn nền tảng này chưa gọi dịch vụ AI.

## Kiểm thử

```bash
npm run test:docs
npm test --prefix backend
npm test --prefix frontend
npm run build --prefix frontend
```

## Triển khai

### Backend trên Render

Repository có `render.yaml`. Cấu hình các biến:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `TEACHER_SECRET`
- `CORS_ORIGIN=https://frontend-alpha-henna-71.vercel.app`

Build command: `npm run build`. Start command: `npm start`. Health check: `/health`.

### Frontend trên Vercel

- Root directory: `frontend`
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- `VITE_API_URL=https://lms-thpt-camau.onrender.com`

## API chính

| Method | Endpoint | Vai trò |
|---|---|---|
| POST | `/api/register`, `/api/login` | Công khai |
| GET/POST/DELETE | `/api/classes`, `/api/classes/:id` | Giáo viên; danh sách cho cả hai vai trò |
| POST | `/api/classes/join` | Học sinh |
| GET/POST/PATCH/DELETE | `/api/classes/:id/students...` | Giáo viên |
| GET/POST/PATCH | `/api/assignment-library...` | Giáo viên |
| POST | `/api/assignment-library/:id/deliver` | Giáo viên |
| PATCH/POST | `/api/assignment-deliveries/:id`, `/detach` | Giáo viên |
| GET | `/api/my-assignments`, `/api/assignment-deliveries/:id` | Học sinh |
| POST | `/api/assignment-deliveries/:id/submit` | Học sinh |
| GET/POST | `/api/submissions/:id/regrade` | Học sinh |
| GET | `/api/classes/:id/gradebook` | Giáo viên |
| GET | `/api/classes/:id/submissions/:submissionId` | Giáo viên sở hữu lớp |
| GET/POST/PATCH | `/api/competencies...` | Giáo viên; khung chuẩn và kỹ năng riêng |
| GET/PUT | `/api/assignments/:assignmentId/competencies` | Giáo viên sở hữu bài |
| GET/POST | `/api/classes/:id/competencies` | Giáo viên sở hữu lớp; xem/tính chỉ số |
| GET | `/api/classes/:id/students/:studentId/competencies` | Giáo viên sở hữu lớp |

## Xử lý nhanh

- Trang chưa cập nhật: nhấn `Ctrl + F5`, sau đó đăng nhập lại.
- Không thấy bài: kiểm tra bài đã xuất bản, đúng môn/khối và học sinh nằm trong danh sách nhận.
- Không thấy bài nộp: vào lớp → **Bảng điểm** → bấm trực tiếp vào ô điểm.
- Lỗi quyền sau khi đổi khóa: đăng xuất rồi đăng nhập lại.
- Trước khi xóa lớp: đọc cảnh báo và nhập chính xác tên lớp; thao tác không thể hoàn tác.

Xem hướng dẫn từng bước tại [cẩm nang HTML](docs/huong-dan-su-dung.html) hoặc gửi [bản PDF](output/pdf/cam-nang-su-dung-lms-thpt.pdf).
