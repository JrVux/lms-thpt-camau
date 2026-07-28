# Thiết kế Kho bài tập và giao bài theo lớp/học sinh

## Mục tiêu

Tạo mục **Bài tập** độc lập ngay sau **Lớp học** trong thanh điều hướng. Giáo viên quản lý bài trong một kho tập trung theo bốn nhóm **Khối 10**, **Khối 11**, **Khối 12** và **Nâng cao**, sau đó giao một bài cho nhiều lớp, cho toàn bộ lớp hoặc chỉ một số học sinh.

Nội dung bài có thể tiếp tục đồng bộ từ bài gốc hoặc được tách thành bản riêng cho một lớp. Thiết lập giao bài và bài nộp luôn độc lập theo từng lớp.

## Phạm vi giai đoạn đầu

Giai đoạn này bao gồm:

- kho bài tập tập trung cho giáo viên;
- giao bài cho nhiều lớp trong một thao tác;
- chọn toàn lớp hoặc học sinh cụ thể ở từng lớp;
- nội dung liên kết với bài gốc và thao tác tách thành bản riêng;
- danh sách bài tập tổng hợp cho học sinh;
- đánh dấu bài nộp **Cần chấm lại** khi nội dung chấm thay đổi;
- tự chạy lại code đã lưu khi học sinh mở bài cần chấm lại.

Giai đoạn này không xây hệ thống chạy code phía server. Nếu học sinh không mở lại bài, bài nộp vẫn ở trạng thái **Cần chấm lại**.

## Điều hướng và giao diện

### Giáo viên

Thanh bên hiển thị:

1. Lớp học
2. Bài tập

Trang **Bài tập** có bốn tab:

- **Khối 10**
- **Khối 11**
- **Khối 12**
- **Nâng cao**

Mỗi bài hiển thị tiêu đề, loại Python/SQL/HTML, điểm tối đa, phiên bản, số lớp đã giao và trạng thái đồng bộ. Các hành động chính:

- **Tạo bài**
- **Sửa**
- **Giao bài**
- **Xem nơi đã giao**
- **Tách thành bản riêng** từ chi tiết lượt giao của một lớp

### Quy tắc nhóm bài

- Bài Khối 10 chỉ giao cho lớp khối 10.
- Bài Khối 11 chỉ giao cho lớp khối 11.
- Bài Khối 12 chỉ giao cho lớp khối 12.
- Bài Nâng cao phải chọn một loại Python, SQL hoặc HTML.
- Bài Nâng cao chỉ giao cho lớp có `subject` trùng với loại bài.

Theo cấu hình hiện tại, khối 10 dùng Python, khối 11 dùng SQL và khối 12 dùng HTML. Backend vẫn kiểm tra cả `grade` và `subject` thay vì chỉ dựa vào giao diện.

### Cửa sổ Giao bài

Giáo viên có thể chọn nhiều lớp hợp lệ. Mỗi lớp có cấu hình riêng:

- `Toàn bộ lớp` hoặc `Chọn học sinh`;
- danh sách học sinh nếu chọn chế độ cụ thể;
- hạn nộp;
- trạng thái nháp/publish;
- số lượt nộp tối đa.

Ví dụ:

- 10A1: toàn bộ lớp, hạn 20/8, đã publish;
- 10A2: năm học sinh, hạn 25/8, đang nháp;
- 10A3: toàn bộ lớp, hạn 22/8, đã publish.

### Học sinh

Mục **Bài tập** của học sinh tổng hợp mọi bài mà học sinh được nhận từ các lớp đã tham gia. Các nhóm:

- **Cần làm**
- **Đã nộp**
- **Quá hạn**
- **Cần chấm lại**

Học sinh không thuộc danh sách nhận không nhìn thấy bài và không thể truy cập hoặc nộp bài qua API.

## Mô hình dữ liệu

### Mở rộng bảng `assignments`

`assignments` trở thành bản ghi nội dung bài tập, không còn đại diện trực tiếp cho việc giao bài vào một lớp.

Thêm:

- `teacher_id UUID NOT NULL REFERENCES users(id)`
- `category VARCHAR(20) CHECK (category IN ('grade_10', 'grade_11', 'grade_12', 'advanced'))`
- `is_library BOOLEAN NOT NULL DEFAULT true`
- `source_assignment_id UUID NULL REFERENCES assignments(id)`
- `content_version INTEGER NOT NULL DEFAULT 1`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Các cột nội dung hiện tại như tiêu đề, mô tả, loại bài, code, lời giải và điểm tối đa được giữ lại. `test_cases` tiếp tục tham chiếu `assignments.id`.

Các cột `class_id`, `due_date`, `is_published` và `max_submissions` trở thành cột tương thích tạm thời trong giai đoạn migration; luồng mới không đọc chúng.

### Bảng `assignment_deliveries`

Mỗi hàng là một lượt giao bài cho một lớp:

- `id UUID PRIMARY KEY`
- `library_assignment_id UUID NOT NULL REFERENCES assignments(id)`
- `assignment_id UUID NOT NULL REFERENCES assignments(id)`
- `class_id UUID NOT NULL REFERENCES classes(id)`
- `teacher_id UUID NOT NULL REFERENCES users(id)`
- `sync_mode VARCHAR(20) CHECK (sync_mode IN ('linked', 'detached'))`
- `recipient_mode VARCHAR(20) CHECK (recipient_mode IN ('all', 'selected'))`
- `due_date TIMESTAMPTZ NULL`
- `is_published BOOLEAN NOT NULL DEFAULT false`
- `max_submissions INTEGER NULL`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

`library_assignment_id` luôn giữ ID bài gốc trong kho; `assignment_id` là nội dung hiện được delivery sử dụng. Với delivery linked, hai ID giống nhau. Sau khi detach, `library_assignment_id` giữ nguyên còn `assignment_id` chuyển sang bản sao.

Ràng buộc duy nhất `(library_assignment_id, class_id)` ngăn giao trùng cùng một bài gốc vào một lớp, kể cả sau khi delivery được tách riêng. Nếu cần giao lại thành đợt mới trong tương lai, yêu cầu này sẽ được mở rộng bằng `delivery_round`; không nằm trong phạm vi hiện tại.

### Bảng `assignment_recipients`

Chỉ dùng khi `recipient_mode = 'selected'`:

- `delivery_id UUID REFERENCES assignment_deliveries(id) ON DELETE CASCADE`
- `user_id UUID REFERENCES users(id) ON DELETE CASCADE`
- khóa chính `(delivery_id, user_id)`

Mỗi người nhận phải có enrollment trong lớp của delivery. Backend kiểm tra điều này trước khi ghi.

### Mở rộng bảng `submissions`

Thêm:

- `delivery_id UUID REFERENCES assignment_deliveries(id)`
- `graded_content_version INTEGER NOT NULL DEFAULT 1`
- `regrade_status VARCHAR(20) CHECK (regrade_status IN ('current', 'required', 'running', 'failed')) DEFAULT 'current'`
- `regrade_error TEXT NULL`

Trong giai đoạn chuyển đổi, `assignment_id` được giữ để tương thích và đối chiếu. API mới dùng `delivery_id` làm định danh chính.

## Đồng bộ và tách bản riêng

### Chế độ liên kết

Delivery `linked` tham chiếu trực tiếp bài gốc trong kho. Tiêu đề, mô tả, code, test case và thang điểm luôn lấy từ bài gốc. Sửa bài gốc tăng `content_version`.

Các thiết lập sau không đồng bộ vì thuộc từng lớp:

- hạn nộp;
- publish;
- số lượt nộp;
- chế độ toàn lớp/một số học sinh;
- danh sách học sinh nhận bài.

### Tách thành bản riêng

Khi giáo viên chọn **Tách thành bản riêng**:

1. backend sao chép nội dung assignment và toàn bộ test case;
2. bản sao có `is_library = false`;
3. `source_assignment_id` trỏ về bài gốc để truy vết;
4. delivery giữ `library_assignment_id`, chuyển `assignment_id` sang bản sao và đặt `sync_mode = 'detached'`.

Sau khi tách, sửa bài gốc không ảnh hưởng delivery đó. Sửa bản riêng vẫn tăng phiên bản và đánh dấu bài nộp của chính delivery là cần chấm lại.

Thao tác tách phải nguyên tử: nếu sao chép test case thất bại, không đổi delivery và xóa bản sao chưa hoàn chỉnh.

## Luồng cập nhật và chấm lại giai đoạn đầu

Khi sửa các trường chỉ mang tính trình bày như tiêu đề hoặc mô tả, nội dung mới hiển thị ngay nhưng không đánh dấu chấm lại.

Khi sửa một trong các trường ảnh hưởng kết quả:

- starter code;
- setup SQL;
- test code;
- test case input;
- expected output;
- points;
- max score;

backend:

1. tăng `content_version`;
2. tìm mọi delivery liên kết với assignment;
3. cập nhật các submission có phiên bản cũ thành `regrade_status = 'required'`.

Khi học sinh mở một delivery cần chấm lại:

1. frontend tải code đã nộp gần nhất và test case mới;
2. trình chạy hiện tại trong trình duyệt tự chạy lại;
3. frontend gửi kết quả tới endpoint regrade;
4. backend tính và lưu điểm theo test case hiện tại;
5. submission chuyển về `current` và lưu `graded_content_version` mới.

Nếu trình duyệt không chạy được, submission chuyển thành `failed`, giữ điểm cũ và hiển thị lỗi ngắn cho giáo viên/học sinh. Không xóa điểm cũ trước khi chấm lại thành công.

## API dự kiến

### Kho bài tập

- `GET /api/assignment-library?category=grade_10`
- `POST /api/assignment-library`
- `GET /api/assignment-library/:id`
- `PATCH /api/assignment-library/:id`
- `POST /api/assignment-library/:id/test-cases`

### Giao bài

- `POST /api/assignment-library/:id/deliver`
- `GET /api/assignment-library/:id/deliveries`
- `PATCH /api/assignment-deliveries/:id`
- `POST /api/assignment-deliveries/:id/detach`

Payload giao nhiều lớp:

```json
{
  "deliveries": [
    {
      "class_id": "uuid-10a1",
      "recipient_mode": "all",
      "student_ids": [],
      "due_date": "2026-08-20T23:59:00+07:00",
      "is_published": true,
      "max_submissions": 3
    },
    {
      "class_id": "uuid-10a2",
      "recipient_mode": "selected",
      "student_ids": ["student-1", "student-2"],
      "due_date": "2026-08-25T23:59:00+07:00",
      "is_published": false,
      "max_submissions": null
    }
  ]
}
```

### Học sinh và chấm lại

- `GET /api/my-assignments?status=pending`
- `GET /api/assignment-deliveries/:id`
- `POST /api/assignment-deliveries/:id/submit`
- `POST /api/submissions/:id/regrade`

API chi tiết delivery chỉ trả lời giải cho giáo viên. API submit/regrade kiểm tra enrollment, recipient, publish, hạn nộp và số lượt nộp ở backend.

## Migration dữ liệu hiện tại

Migration chạy theo thứ tự:

1. thêm bảng/cột mới dưới dạng nullable hoặc có default an toàn;
2. với mỗi assignment hiện tại, lấy giáo viên và khối từ `classes`;
3. đặt assignment hiện tại thành bài trong kho, xác định `category` theo khối;
4. tạo một delivery `linked`, đặt cả `library_assignment_id` và `assignment_id` bằng ID bài hiện tại, rồi sao chép lớp, hạn nộp, publish và số lượt nộp;
5. gán mọi submission hiện tại vào delivery tương ứng;
6. điền phiên bản chấm hiện tại và `regrade_status = 'current'`;
7. thêm ràng buộc `NOT NULL` và index sau khi backfill hoàn tất.

Không xóa assignment, test case, submission hoặc điểm hiện có. Migration có thể chạy lại an toàn bằng `INSERT ... ON CONFLICT DO NOTHING` và các cập nhật có điều kiện.

## Quyền truy cập và tính toàn vẹn

- Giáo viên chỉ quản lý template và delivery của mình.
- Lớp đích phải thuộc giáo viên.
- Nhóm Khối chỉ giao đúng grade; Nâng cao chỉ giao đúng subject.
- Học sinh cụ thể phải đang thuộc lớp.
- Học sinh chỉ đọc/nộp delivery đã publish và được nhận.
- Cập nhật nhiều lớp được kiểm tra toàn bộ trước khi ghi.
- Mỗi delivery được tạo trong transaction/RPC; lỗi một delivery được trả riêng, không để dữ liệu recipient dở dang.
- Thao tác detach và thay test case dùng transaction/RPC để tránh bản sao thiếu dữ liệu.

## Hiệu năng

Thêm index:

- `assignments(teacher_id, category, updated_at DESC)`
- `assignment_deliveries(class_id, is_published)`
- `assignment_deliveries(library_assignment_id, class_id)` (unique)
- `assignment_deliveries(assignment_id, sync_mode)`
- `assignment_recipients(user_id, delivery_id)`
- `submissions(delivery_id, user_id, submitted_at DESC)`
- `submissions(regrade_status, delivery_id)`

Trang học sinh dùng một truy vấn delivery đã lọc quyền thay vì gọi API riêng cho từng lớp/bài như Dashboard hiện tại. Điều này loại bỏ mô hình N+1 request đang có.

## Xử lý lỗi

- Không có lớp hợp lệ: giải thích yêu cầu grade/subject.
- Chế độ `selected` nhưng không chọn học sinh: từ chối trước khi ghi.
- Học sinh không còn trong lớp: không cho nộp mới; giữ lịch sử submission.
- Bài gốc bị sửa trong lúc giao: delivery lưu phiên bản nhận tại thời điểm tạo và sau đó theo phiên bản mới vì đang linked.
- Chấm lại thất bại: giữ điểm gần nhất, ghi trạng thái/lỗi và cho phép thử lại.
- Tách bản riêng thất bại: rollback toàn bộ.

## Kiểm thử

### Backend

- lọc đúng bài theo giáo viên và category;
- chặn giao sai grade/subject;
- giao nhiều lớp với cấu hình độc lập;
- chặn học sinh không thuộc lớp;
- toàn lớp và selected trả đúng quyền xem/nộp;
- linked đọc nội dung mới sau cập nhật;
- detached không nhận cập nhật bài gốc;
- detach sao chép đầy đủ test case và rollback khi lỗi;
- thay đổi nội dung chấm tăng version và đánh dấu đúng submissions;
- regrade thành công cập nhật điểm/version;
- regrade thất bại giữ điểm cũ;
- migration bảo toàn assignment, test case, submission và điểm.

### Frontend

- điều hướng Bài tập xuất hiện đúng role;
- tab Khối/Nâng cao lọc đúng;
- cửa sổ giao bài quản lý cấu hình riêng từng lớp;
- selected hiển thị/tìm kiếm/chọn học sinh đúng;
- học sinh chỉ thấy bài được nhận;
- trạng thái Cần làm/Đã nộp/Quá hạn/Cần chấm lại đúng;
- luồng regrade tự chạy khi mở và hiển thị lỗi khi thất bại.

### Xác minh hồi quy

- luồng tạo/sửa bài Python, SQL, HTML hiện tại vẫn hoạt động;
- bảng điểm và export tiếp tục dùng đúng delivery;
- giới hạn số lượt nộp hoạt động theo từng lớp;
- build production và toàn bộ test tự động thành công.

## Tiêu chí hoàn thành

- Mục Bài tập hoạt động cho cả giáo viên và học sinh.
- Kho bài có đủ bốn nhóm và quy tắc lớp hợp lệ.
- Một lần giao hỗ trợ nhiều lớp, toàn lớp hoặc học sinh cụ thể.
- Thiết lập từng lớp độc lập.
- Nội dung linked đồng bộ; delivery có thể detach an toàn.
- Thay đổi nội dung chấm đánh dấu bài nộp cần chấm lại.
- Học sinh mở bài sẽ tự chạy lại code theo test mới.
- Dữ liệu và điểm hiện tại được bảo toàn sau migration.
- Không có đường API vượt quyền recipient.
