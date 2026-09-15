# Thiết kế tự động bảo đảm bài tự luận vào hàng đợi AI

**Ngày:** 2026-09-15  
**Trạng thái:** Đã được người dùng duyệt phương án 2  
**Phạm vi:** Luồng tạo job chấm AI sau khi nộp bài tự luận một file hoặc nhiều file; không thay đổi cách AI chấm, duyệt hay công bố điểm.

## 1. Vấn đề

Sau khi một bài tự luận bật chấm AI được lưu bền vững, backend có thử tạo `essay_grading_jobs`. Tuy nhiên lỗi enqueue hiện bị nuốt để bảo vệ bài nộp. Luồng nhiều file còn suy ra `grading_queued` từ điều kiện “bài vừa được tạo và có bật AI” thay vì kết quả tạo job thật. Vì vậy API có thể báo thành công dù không có job; màn giáo viên sau đó dựng trạng thái `not_queued` và buộc giáo viên bấm “Đưa vào hàng chờ”.

Bài cũ được nộp trước khi bật AI hoặc trong thời gian enqueue lỗi cũng không có cơ chế tự bổ sung job. Nút thủ công đang trở thành thao tác bắt buộc thay vì đường khôi phục hiếm gặp.

## 2. Mục tiêu và nguyên tắc

- Mọi submission mới của bài `essay` đang bật AI được tự động bảo đảm có đúng một job ban đầu.
- Submission đã lưu luôn được giữ nguyên nếu hệ thống hàng đợi hoặc AI gặp lỗi.
- Confirm lặp, retry HTTP và nhiều tiến trình backend không tạo job hoạt động trùng nhau.
- Bài mới bị sót và bài cũ chưa từng có job được worker tự bổ sung mà không cần giáo viên bấm.
- `grading_queued` phản ánh trạng thái lưu trong database, không phản ánh ý định enqueue.
- Lỗi enqueue được ghi log nội bộ đủ để chẩn đoán nhưng không lộ đáp án, nội dung bài, object key, token hoặc thông tin học sinh.
- Nút “Đưa vào hàng chờ” vẫn tồn tại như đường khôi phục thủ công và không đổi phân quyền.

Không thuộc phạm vi:

- Tự động retry job đã ở trạng thái `failed`; worker hiện tại và thao tác giáo viên tiếp tục quyết định trường hợp này.
- Tự động công bố điểm hoặc bỏ bước giáo viên duyệt.
- Thay đổi prompt, mô hình Gemini, OCR, cách tính điểm hoặc giao diện chấm.
- Triển khai production, chạy migration production hoặc thay đổi secrets trong giai đoạn triển khai local.

## 3. Phương án được chọn

Thêm một primitive idempotent `ensureQueued` ở tầng `essayGradingService`, dùng cho cả luồng nộp mới và worker hòa giải. Primitive này trả job đã có hoặc tạo job mới; nếu gặp race, nó đọc lại job vừa được tiến trình khác tạo và coi đó là thành công.

Thêm một worker hòa giải định kỳ, đọc danh sách giới hạn các submission tự luận bật AI nhưng chưa từng có job, rồi gọi `ensureQueued`. Database cung cấp một RPC service-role-only để chọn chính xác các ID đang thiếu, tránh scan toàn bộ bài nộp trong tiến trình web.

Các phương án không chọn:

- Chỉ sửa cờ và ghi log: phản hồi đúng hơn nhưng giáo viên vẫn phải bấm khi enqueue lỗi.
- Tạo job trong cùng transaction confirm: nhất quán mạnh nhưng sự cố hàng đợi sẽ làm học sinh không thể hoàn tất nộp bài, trái nguyên tắc bài nộp độc lập với AI.

## 4. Thành phần và trách nhiệm

### 4.1. `essayGradingService.ensureQueued`

Input gồm submission đã lưu, cấu hình assignment đầy đủ và actor tùy chọn. Hàm:

1. bỏ qua khi bài không bật AI hoặc thiếu submission ID;
2. tìm job mới nhất của submission;
3. nếu đã có bất kỳ job nào thì trả job đó, không tạo lại;
4. nếu chưa có thì dùng `enqueue` hiện tại để lưu snapshot và job `queued`;
5. nếu insert lỗi, đọc lại một lần để phân biệt race/partial success với lỗi thật;
6. chỉ ném lỗi khi database vẫn không có job.

`retry` dành cho giáo viên vẫn dùng `enqueue` trực tiếp để có thể tạo một job mới sau job `failed` hoặc `awaiting_review`. `ensureQueued` chỉ bảo đảm job ban đầu, không thay đổi lịch sử retry.

### 4.2. Luồng nộp một file và nhiều file

Sau khi submission đã được RPC xác nhận bền vững, cả hai luồng gọi cùng `ensureQueued`:

- Thành công hoặc job đã tồn tại: trả `grading_queued: true`.
- Lỗi thật: vẫn trả nộp bài thành công nhưng `grading_queued: false`, đồng thời ghi log an toàn.
- Confirm session lặp vẫn gọi `ensureQueued` dù RPC trả `created: false`; nhờ đó một request lặp có thể tự chữa lần enqueue đầu bị lỗi mà không tạo submission/job trùng.

Frontend không cần yêu cầu học sinh thao tác thêm. Học sinh tiếp tục thấy bài đã nộp và trạng thái đang chờ giáo viên; chi tiết lỗi kỹ thuật không được trả cho học sinh.

### 4.3. RPC tìm bài thiếu job

Thêm migration tương ứng ở cả cây backend và Supabase. RPC chỉ được thực thi bằng `service_role`, nhận giới hạn nhỏ và trả ID submission thỏa tất cả điều kiện:

- submission có file, là bản `is_latest` và còn tồn tại;
- assignment liên kết có `submission_type = 'essay'` và `ai_grading_enabled = true`;
- chưa có bất kỳ `essay_grading_jobs` nào cho submission đó.

RPC chỉ đọc dữ liệu, không trả đáp án hoặc thông tin học sinh và không cấp quyền cho `anon`/`authenticated`.

### 4.4. Worker hòa giải

Worker chạy trong backend cùng cơ chế bật/tắt với worker chấm tự luận. Mỗi nhịp:

1. lấy tối đa một batch nhỏ ID thiếu job qua RPC;
2. tải submission và assignment đầy đủ bằng service role;
3. xác minh lại bài vẫn là tự luận, còn bật AI và vẫn là submission mới nhất;
4. gọi `ensureQueued` tuần tự để tránh dồn tải;
5. tiếp tục các mục khác nếu một mục lỗi và trả thống kê `scanned`, `queued`, `existing`, `failed`.

Mặc định worker chạy định kỳ với khoảng thời gian cấu hình được. Có biến môi trường riêng để tắt hòa giải khi xử lý sự cố. Worker không gọi Gemini; nó chỉ bổ sung job, còn worker chấm hiện tại tiếp tục claim và xử lý job.

## 5. Idempotency và cạnh tranh

Hai tiến trình có thể cùng thấy chưa có job. Cả hai được phép thử insert; partial unique index hiện có trên job hoạt động sẽ chặn hai job `queued` cho cùng submission. Tiến trình nhận lỗi unique đọc lại job và trả job hiện hữu.

Nếu insert job thành công nhưng insert event `queued` lỗi, lần đọc lại xác nhận job đã tồn tại và không tạo job thứ hai. Lỗi event được ghi log riêng; job vẫn được worker chấm claim. Không xóa submission hoặc job để cố rollback ngoài transaction.

Worker hòa giải chỉ chọn submission chưa từng có job. Job `failed`, `awaiting_review` hoặc đã xử lý không bị tạo lại tự động. Điều này giữ nguyên quyết định chấm lại của giáo viên và lịch sử kiểm toán.

## 6. Quan sát và xử lý lỗi

Mỗi lỗi enqueue/hòa giải ghi log có cấu trúc với operation, submission ID, assignment ID, mã lỗi an toàn và thông báo database đã rút gọn. Không log model answer, rubric đầy đủ, tên học sinh, tên file, nội dung file, object key hoặc credential.

API học sinh không trả chi tiết lỗi. API confirm chỉ trả `grading_queued` đúng theo database. Màn giáo viên tiếp tục suy ra `not_queued` nếu thực sự chưa có job; nút thủ công vẫn hoạt động trong trường hợp worker bị tắt hoặc lỗi cấu hình kéo dài.

Worker không retry nóng vô hạn. Một mục lỗi được thử lại ở nhịp sau; batch có giới hạn và từng mục độc lập để một bài hỏng không chặn bài khác.

## 7. Bảo mật và tương thích

- Chỉ backend service role được gọi RPC hòa giải và đọc snapshot đáp án.
- Không mở thêm endpoint công khai và không thay đổi hợp đồng xác thực JWT.
- Không thay đổi dữ liệu bài nộp, file, điểm, báo cáo hoặc trạng thái công bố.
- Bài `practice_file`, `autograde` và bài tự luận tắt AI không bao giờ được enqueue.
- Submission lịch sử không còn là `is_latest` không được tự chấm lại.
- Migration chỉ bổ sung function/quyền; không drop bảng, cột hoặc dữ liệu.
- Nút retry giáo viên và worker chấm AI hiện tại vẫn tương thích.

## 8. Kiểm thử bắt buộc

### Service và luồng nộp

- `ensureQueued` trả job hiện có và không insert.
- `ensureQueued` tạo job khi chưa có.
- Hai lần gọi/race chỉ cho kết quả một job hoạt động.
- Insert báo lỗi nhưng job đã tồn tại sau đó được coi là thành công.
- Lỗi thật được ném để caller ghi log.
- Nộp một file trả `grading_queued` theo kết quả thật.
- Confirm nhiều file trả `false` khi enqueue lỗi, không còn báo thành công giả.
- Confirm lặp sau lần enqueue lỗi tự tạo job và vẫn trả cùng submission.

### Worker và migration

- RPC chỉ chọn submission mới nhất thuộc bài tự luận bật AI và chưa từng có job.
- RPC bị revoke khỏi public/anon/authenticated và grant cho service role.
- Worker enqueue các mục thiếu, bỏ qua mục đã có và tiếp tục sau lỗi riêng lẻ.
- Worker không tạo job cho bài tắt AI, submission cũ hoặc submission đã có job failed/đã xử lý.
- Worker start/stop theo cấu hình và không ảnh hưởng worker chấm hiện tại.

### Hồi quy và xác minh

- Toàn bộ backend test pass.
- Toàn bộ frontend test pass dù không cần đổi giao diện.
- Vite production build pass.
- Hai migration backend/Supabase có cùng contract.
- Kiểm tra thủ công local: một submission mới tự có job, confirm lặp không tạo job thứ hai và một submission cũ thiếu job được worker bổ sung.

## 9. Phát hành

Thay đổi local gồm backend, hai bản migration bổ sung và test; không có migration dữ liệu phá hủy. Production cần một xác nhận riêng nêu rõ commit, migration mới, backend/worker, frontend có hay không thay đổi, Supabase project và Render service đích.

Thứ tự phát hành dự kiến:

1. áp dụng migration RPC service-role-only;
2. triển khai backend có `ensureQueued` và worker hòa giải;
3. xác minh `/health`, phiên bản đang chạy và log worker khởi động;
4. dùng dữ liệu thử không chứa thông tin học sinh thật để xác minh tự enqueue và chống trùng;
5. xác minh bài cũ thiếu job được tự bổ sung và API học sinh không lộ dữ liệu chấm.

Rollback bằng cách tắt worker hòa giải qua biến môi trường và quay lại backend trước đó. Không drop RPC/bảng hoặc xóa job đã tạo trong quá trình xử lý sự cố.
