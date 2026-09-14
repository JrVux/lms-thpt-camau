# Thiết kế nộp nhiều file cho một bài tự luận

Ngày: 2026-09-14

## 1. Mục tiêu

Cho phép học sinh gửi từ 1 đến 5 file trong một lần nộp bài tự luận. Toàn bộ file của một lần nộp tạo thành một bài làm duy nhất, có một điểm, một nhận xét, một trạng thái công bố và một AI grading job.

Khi nộp lại, học sinh phải gửi một bộ file hoàn chỉnh mới. Bộ mới trở thành bản chính thức; các bộ cũ được giữ trong lịch sử theo từng lần nộp.

## 2. Phạm vi

- Chỉ áp dụng cho `submission_type = 'essay'`.
- Mỗi lần nộp có tối thiểu 1 và tối đa 5 file.
- Giới hạn `max_file_size_mb` hiện tại áp dụng riêng cho từng file.
- Các định dạng file cho phép tiếp tục lấy từ cấu hình bài tập hiện tại.
- `max_submissions` đếm số lần nộp đã xác nhận, không đếm số file hoặc phiên upload tạm.
- Giáo viên chấm một điểm và một nhận xét chung cho cả bộ file.
- AI đọc tất cả file theo thứ tự học sinh đã sắp xếp và tạo một báo cáo tổng hợp.
- Bài thực hành và các bài tự luận một file đã tồn tại không thay đổi hành vi.

Không thuộc phạm vi:

- Tăng giới hạn lên quá 5 file.
- Cho phép thêm file vào một lần nộp đã xác nhận.
- Chấm điểm riêng từng file.
- Chia sẻ khóa R2, URL nội bộ hoặc thông tin storage cho client.
- Thay đổi định dạng file được hỗ trợ hoặc giới hạn dung lượng mặc định.

## 3. Mô hình dữ liệu

### 3.1. Submission cha

`submissions` tiếp tục là bản ghi đại diện cho một lần nộp. Mọi dữ liệu nghiệp vụ hiện có vẫn gắn với submission cha:

- học sinh, delivery và assignment;
- `is_latest`, `is_late` và thời gian nộp;
- điểm, nhận xét và người chấm;
- AI grading job, report, event và trạng thái công bố;
- giới hạn số lần nộp và lịch sử.

Với submission nhiều file mới, các cột file cũ trên `submissions` phản chiếu file đầu tiên để giữ tương thích với code và dữ liệu lịch sử. Đây chỉ là lớp tương thích; danh sách file chính thức nằm trong `submission_files`.

### 3.2. Bảng `submission_files`

Thêm bảng service-role-only:

- `id UUID PRIMARY KEY`;
- `submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE`;
- `object_key TEXT NOT NULL UNIQUE`;
- `file_name TEXT NOT NULL`;
- `mime_type TEXT NOT NULL`;
- `file_size BIGINT NOT NULL CHECK (file_size > 0)`;
- `sort_order SMALLINT NOT NULL CHECK (sort_order BETWEEN 0 AND 4)`;
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
- `UNIQUE (submission_id, sort_order)`.

RLS được bật; `anon` và `authenticated` không có quyền trực tiếp. Chỉ backend dùng `service_role` được đọc hoặc ghi. Mọi response public phải loại bỏ `object_key`.

Submission cũ không có dòng `submission_files`. Backend phải dùng file trên submission cha làm fallback. Không backfill hoặc sửa dữ liệu lịch sử trong migration này.

### 3.3. Phiên upload tạm

Thêm hai bảng service-role-only:

- `submission_upload_sessions`: chủ sở hữu, delivery, trạng thái, số file mong đợi, thời gian hết hạn, submission đã xác nhận nếu có.
- `submission_upload_session_files`: session, thứ tự, metadata file, khóa R2 riêng, trạng thái upload và trạng thái dọn dẹp.

Trạng thái session gồm `uploading`, `confirming`, `confirmed`, `cancelled`, `expired` và `cleanup_pending`. Phiên xác nhận thành công lưu `confirmed_submission_id` để confirm có tính idempotent.

Phiên tạm không phải submission, không xuất hiện trong lịch sử và không tính vào `max_submissions`.

### 3.4. Migration

Tạo hai bản migration cùng nội dung nghiệp vụ:

- `backend/src/database/migrations/017_multi_file_essay_submissions.sql`;
- `supabase/migrations/022_multi_file_essay_submissions.sql`.

Migration chỉ bổ sung bảng, index, constraint và RPC; không drop cột/bảng và không chuyển đổi submission cũ.

## 4. API và luồng upload

### 4.1. Tạo phiên

`POST /api/file-submissions/deliveries/:deliveryId/upload-sessions`

Body chứa danh sách 1-5 metadata file theo thứ tự. Backend phải kiểm tra:

- JWT học sinh hợp lệ;
- học sinh còn thuộc lớp và thuộc danh sách nhận bài;
- bài là tự luận;
- chưa quá hạn hoặc được phép nộp trễ;
- số file, MIME, tên và dung lượng từng file hợp lệ;
- tên file không trùng trong cùng bộ;
- học sinh chưa vượt `max_submissions`.

Response chỉ trả session ID và các file ID mờ; không trả `object_key`.

### 4.2. Upload từng file

`POST /api/file-submissions/upload-sessions/:sessionId/files/:fileId`

Frontend gọi tuần tự theo `sort_order`; mỗi request chỉ chứa một file. Backend kiểm tra lại quyền sở hữu session, kích thước khai báo, chữ ký thực tế của file và MIME trước khi lưu bền vững vào R2. File được đánh dấu `uploaded` chỉ sau khi R2 xác nhận thành công.

Không ghi metadata vào `submissions` trong bước này.

### 4.3. Xác nhận

`POST /api/file-submissions/upload-sessions/:sessionId/confirm`

Backend khóa session và kiểm tra lại quyền nhận bài, hạn nộp và `max_submissions`. RPC `confirm_multi_file_submission` phải:

1. khóa phạm vi delivery + học sinh để chống hai confirm đồng thời;
2. xác nhận session thuộc đúng học sinh/delivery và có 1-5 file `uploaded`;
3. trả lại submission cũ nếu session đã được confirm;
4. tạo một submission cha với metadata tương thích từ file đầu tiên;
5. tạo toàn bộ `submission_files` theo thứ tự;
6. đánh dấu submission trước không còn `is_latest`;
7. đánh dấu session `confirmed` và lưu `confirmed_submission_id`;
8. trả submission mới trong cùng transaction.

Sau commit database thành công, backend tạo đúng một AI job nếu bài bật chấm AI. Nếu enqueue AI thất bại, submission vẫn thành công và giáo viên có thể yêu cầu chấm lại như luồng hiện tại.

### 4.4. Hủy và dọn dẹp

`DELETE /api/file-submissions/upload-sessions/:sessionId`

Nếu một file upload lỗi, học sinh hủy hoặc confirm lỗi, không tạo submission. Backend xóa các object R2 đã tải và đánh dấu session đã hủy. Xóa R2 là best-effort có retry: nếu storage tạm lỗi, session chuyển `cleanup_pending`; file vẫn private và không thể tải qua API.

Một worker nhẹ thu hồi session hết hạn và retry cleanup. Worker chỉ xử lý object thuộc session tạm; không được xóa file của submission đã confirm. Mọi thao tác xóa phải kiểm tra object key thuộc đúng prefix upload tạm của session.

### 4.5. Đọc và tải file

Student detail và teacher roster trả `history[].files` đã loại bỏ object key. Nếu submission không có child file, serializer tạo mảng fallback gồm file cũ trên submission cha.

`GET /api/file-submissions/:submissionId/files/:fileId/download` kiểm tra:

- học sinh chỉ tải file của chính mình;
- giáo viên chỉ tải file thuộc lớp mình quản lý;
- file thực sự thuộc submission trong URL.

Endpoint download submission cũ tiếp tục hoạt động. Với submission nhiều file, endpoint cũ trả file đầu tiên để không phá consumer cũ.

## 5. Giao diện học sinh

`FileDropzone` hỗ trợ chọn nhiều file cho bài tự luận và giữ chế độ một file cho luồng khác.

Trước khi nộp, giao diện:

- hiển thị số lượng `n/5`;
- hiển thị tên, định dạng và dung lượng từng file;
- cho phép xóa và đổi thứ tự file;
- chặn file trùng tên, sai MIME, vượt dung lượng hoặc tổng số quá 5;
- hiển thị tiến độ và lỗi riêng từng file cùng tiến độ tổng.

Nút nộp chỉ bật khi có 1-5 file hợp lệ. Trong lúc upload hoặc confirm, không cho sửa danh sách. Nếu bất kỳ file nào lỗi, giao diện thông báo lần nộp chưa được ghi nhận và cho phép thử lại toàn bộ.

Lịch sử hiển thị theo lần nộp. Mỗi lần có thời gian, trạng thái trễ, nhãn bản chính thức và danh sách file có nút tải riêng. Điểm, báo cáo AI và đáp án mẫu đã công bố chỉ hiển thị một lần ở submission cha.

Khi nộp lại, danh sách chọn mới bắt đầu rỗng; học sinh phải chọn lại toàn bộ bộ file.

## 6. Giao diện giáo viên

Danh sách lớp vẫn có một dòng cho mỗi học sinh và chọn submission mới nhất như hiện tại.

Trong chi tiết chấm bài:

- hiển thị toàn bộ file của submission theo `sort_order`;
- cho phép xem/tải từng file;
- hiển thị rõ số file và tên file;
- giữ một ô điểm, một nhận xét và một trạng thái duyệt/công bố chung;
- giữ lịch sử các lần nộp mà không trộn file giữa các lần.

CSV/XLSX export chỉ ghi danh sách tên file đã escape an toàn; không ghi URL tải xuống, object key hoặc token.

## 7. AI chấm tự luận nhiều file

Worker tải `submission_files` theo `sort_order`; nếu không có child file thì dùng file cũ trên submission cha.

`submissionFileReader` được mở rộng thành luồng đọc nhiều file:

- DOCX và PDF có text được trích xuất cục bộ;
- ảnh và PDF scan được gửi lần lượt cho Gemini để trích xuất nội dung, mỗi request chỉ chứa một file;
- kết quả mỗi file giữ tên file, phương pháp trích xuất và cảnh báo riêng;
- nội dung được ghép theo thứ tự với ranh giới rõ ràng, ví dụ `<submission_file index="1" name="...">`;
- nội dung file luôn là dữ liệu không tin cậy, không phải chỉ dẫn cho AI.

Sau bước trích xuất, gateway thực hiện một lượt chấm tổng hợp bằng đề bài, đáp án mẫu và toàn bộ nội dung đã đọc. Báo cáo vẫn thuộc một job và một submission.

Nếu một file không đọc được nhưng phần còn lại đủ nội dung, worker tạo bản nháp với cảnh báo nêu đúng file bị lỗi. Nếu không file nào đọc được hoặc tổng nội dung vượt giới hạn an toàn hiện có, job thất bại bằng mã lỗi an toàn để giáo viên chấm thủ công; hệ thống không tự cho 0 điểm và không âm thầm cắt bỏ nội dung.

Provider/model, raw OCR, object key và lỗi nội bộ không được trả cho học sinh. Giáo viên vẫn phải duyệt trước khi công bố.

## 8. Tính tương thích

- Giữ `create_file_submission` và endpoint nộp một file hiện tại cho consumer cũ.
- Submission cũ không có `submission_files` được chuẩn hóa thành mảng một phần tử ở tầng service.
- Trường `object_key`, `file_name`, `mime_type` và `file_size` trên submission cha chưa bị xóa.
- AI job/report cũ tiếp tục dùng submission ID như hiện tại.
- Chấm thủ công, công bố, thu hồi công bố, export và phân tích năng lực vẫn tham chiếu submission cha.
- Bài thực hành không chuyển sang giao diện nhiều file trong phiên bản này.

## 9. Bảo mật và quyền riêng tư

- Mọi endpoint session, upload, confirm, cancel và download đều xác thực application JWT.
- Backend không tin `studentId`, `deliveryId`, file count, MIME, size hoặc thứ tự do client khai báo mà không kiểm tra lại.
- Mọi truy vấn file phải ràng buộc file -> submission -> delivery -> học sinh/lớp.
- R2 giữ private; không đưa credential, object key hoặc URL nội bộ vào response/log/export.
- File name được làm sạch, giới hạn độ dài và escape khi xuất bảng tính.
- Chữ ký file thực tế phải khớp MIME khai báo trước khi đánh dấu upload thành công.
- Session và bảng file bật RLS, revoke quyền public/authenticated và chỉ grant cho service role.
- Confirm có khóa và idempotency để không vượt giới hạn số lần nộp khi request lặp hoặc chạy đồng thời.

## 10. Xử lý lỗi

- 0 file hoặc trên 5 file: chặn trước upload.
- File sai loại, quá dung lượng, rỗng hoặc giả MIME: chỉ rõ file lỗi; không tạo submission.
- Một file upload thất bại: hủy toàn bộ lần nộp, cleanup các file tạm đã thành công.
- Confirm lặp: trả lại cùng submission, không tạo lần nộp thứ hai và không enqueue AI job thứ hai.
- Hết hạn hoặc mất quyền trước confirm: từ chối confirm và cleanup session.
- Vượt `max_submissions` tại confirm: từ chối dù session đã được tạo trước đó.
- Cleanup R2 thất bại: giữ `cleanup_pending` và retry; không công khai file tạm.
- Một file không đọc được: cảnh báo theo file và chỉ chấm nếu phần còn lại đủ nội dung.
- Tất cả file không đọc được hoặc nội dung quá dài: AI job thất bại an toàn, không tự cho 0.

## 11. Kiểm thử bắt buộc

### Database và migration

- Hai migration có cùng schema/RPC contract và không chứa thao tác drop.
- Constraint từ chối file thứ 6, thứ tự trùng, file rỗng và session sai chủ sở hữu.
- Confirm tạo một parent và đúng 1-5 child file trong một transaction.
- Confirm lặp trả cùng submission; hai confirm đồng thời không vượt `max_submissions`.
- Bài cũ không cần backfill và vẫn đọc được.
- RLS/revoke/grant không cho client truy cập trực tiếp khóa R2.

### Backend

- Tạo session từ chối không đúng học sinh, sai delivery, quá hạn, quá số lần hoặc metadata lỗi.
- Upload từng file kiểm tra lại quyền, MIME thực, dung lượng và thứ tự.
- Một upload/RPC lỗi không tạo submission và yêu cầu cleanup đúng object của session.
- Serializer trả mảng file an toàn, fallback đúng cho bài một file và không rò object key.
- Download từng file kiểm tra ownership cả học sinh và giáo viên.
- Giáo viên chấm một điểm chung cho bundle.
- Worker đọc đúng thứ tự 1-5 file, tổng hợp text và cảnh báo theo file.
- AI enqueue đúng một lần; confirm idempotent không tạo job trùng.
- Không file nào đọc được hoặc nội dung quá dài thì fail an toàn.

### Frontend

- Chọn, xóa và đổi thứ tự tối đa 5 file.
- Chặn file thứ 6, tên trùng, MIME sai và từng file quá dung lượng.
- Upload tuần tự và hiển thị tiến độ/lỗi theo file.
- Một file lỗi không hiển thị trạng thái đã nộp.
- Confirm thành công làm mới lịch sử theo submission bundle.
- Nộp lại yêu cầu chọn bộ file mới đầy đủ.
- Student history và teacher detail nhóm đúng file theo từng lần nộp.
- Bài thực hành và bài tự luận một file cũ không hồi quy.

### Xác minh tổng thể

- Chạy toàn bộ test backend và frontend.
- Build Vite production.
- Kiểm tra migration bằng database thử nghiệm trước production.
- Thử nghiệm ba vai trò/phạm vi: học sinh chủ sở hữu, học sinh không có quyền và giáo viên của lớp.
- Thử các bộ 1 file, 5 file, upload lỗi giữa chừng, confirm lặp, nộp lại và AI có một file khó đọc.

## 12. Phát hành và rollback

Đây là thay đổi có migration. Production cần phê duyệt riêng sau khi code và kiểm thử local hoàn tất.

Thứ tự phát hành:

1. xác minh R2 credential có quyền PUT, GET và DELETE;
2. áp dụng migration bổ sung;
3. triển khai backend/worker tương thích ngược;
4. triển khai frontend;
5. chạy probe quyền và một bài test nhiều file không dùng dữ liệu học sinh thật;
6. xác minh đúng bundle trên `https://lms-thpt-camau.onrender.com`.

Rollback code vẫn an toàn vì migration chỉ bổ sung. Không rollback bằng cách drop bảng trong sự cố. Nếu cần, tắt giao diện nhiều file và quay về endpoint một file; dữ liệu bundle đã xác nhận vẫn được backend mới/phiên bản sửa tiếp theo xử lý, không xóa submission hoặc file.
