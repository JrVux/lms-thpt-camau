# Thiết kế phân tích bài làm bằng AI và lộ trình bồi dưỡng cá nhân

**Ngày:** 2026-08-15

**Trạng thái:** Đã duyệt thiết kế hội thoại, chờ duyệt tài liệu

**Phạm vi:** Phân tích theo từng học sinh, giáo viên chủ động yêu cầu

## 1. Mục tiêu

Xây dựng chức năng giúp giáo viên dùng bằng chứng từ bài làm để:

- hiểu điểm mạnh, phần kiến thức cần củng cố và lỗi thường gặp của từng học sinh;
- tạo hai bản nhận xét riêng cho giáo viên và học sinh;
- xây dựng lộ trình bồi dưỡng hai tuần theo ba giai đoạn;
- ưu tiên bài có sẵn, chỉ dùng AI tạo bài mới khi kho bài thiếu;
- bảo đảm giáo viên kiểm duyệt trước khi nhận xét được công bố hoặc bài được giao.

Điểm số, mức thành thạo và xu hướng vẫn được tính bằng quy tắc của hệ thống. AI chỉ diễn giải bằng chứng và đề xuất hành động, không được tự sửa các chỉ số này.

## 2. Phạm vi phiên bản đầu

Giáo viên mở hồ sơ năng lực của một học sinh và bấm **Phân tích bằng AI**. Phạm vi mặc định là 5 bài nộp gần nhất; giáo viên có thể chọn 3, 10 bài hoặc một khoảng ngày.

Phiên bản đầu không tự động phân tích sau mỗi lần nộp và không phân tích cả lớp theo lô. Kiến trúc tác vụ chạy nền vẫn được thiết kế để có thể mở rộng các khả năng này sau này.

## 3. Nguyên tắc sản phẩm

1. Mọi kết luận phải gắn với một hoặc nhiều mã bằng chứng như `E01`, `E02`.
2. Khi dữ liệu yếu hoặc mâu thuẫn, AI phải ghi rõ chưa đủ dữ liệu để kết luận.
3. Không suy đoán thái độ, trí thông minh, tính cách, hoàn cảnh hay nguyên nhân ngoài dữ liệu học tập.
4. Không gửi thông tin định danh học sinh cho nhà cung cấp AI.
5. Kết quả AI luôn là bản nháp; giáo viên là người chịu trách nhiệm duyệt và công bố.
6. AI không tự giao bài, thay điểm hoặc thay mức năng lực.

## 4. Trải nghiệm giáo viên

### 4.1 Tạo yêu cầu phân tích

Trong hồ sơ học sinh, giáo viên:

1. chọn số bài gần nhất hoặc khoảng ngày;
2. xem trước số bài, số kết quả test và số năng lực có bằng chứng;
3. bấm **Phân tích bằng AI**;
4. theo dõi trạng thái tác vụ mà không cần giữ nguyên trang;
5. nhận bản nháp, xem dẫn chứng, chỉnh sửa và quyết định duyệt.

Ngưỡng dữ liệu khuyến nghị là ít nhất 2 bài nộp và 4 kết quả test. Nếu thấp hơn, hệ thống cảnh báo và yêu cầu giáo viên xác nhận rõ trước khi tiếp tục.

### 4.2 Trạng thái tác vụ

Luồng chính:

`queued → preparing_evidence → analyzing → awaiting_review → published`

Các trạng thái bổ sung:

- `failed`: lỗi có thể thử lại;
- `rejected`: giáo viên từ chối bản nháp;
- `approved_internal`: đã duyệt nhưng chỉ lưu nội bộ;
- `stale`: có bài nộp mới sau thời điểm phân tích;
- `withdrawn`: giáo viên thu hồi bản đã công bố.

Mỗi học sinh trong một lớp chỉ có tối đa một tác vụ đang xử lý tại cùng thời điểm. Khóa chống trùng dựa trên lớp, học sinh, phạm vi dữ liệu và dấu vết phiên bản bằng chứng.

### 4.3 Kiểm duyệt

Giáo viên có thể:

- mở đúng bài nộp và test tương ứng từ từng dẫn chứng;
- sửa, xóa hoặc bổ sung nội dung;
- duyệt để lưu nội bộ;
- duyệt và công bố cho học sinh;
- từ chối và yêu cầu phân tích lại với chỉ dẫn bổ sung.

Hệ thống lưu riêng nội dung AI ban đầu và nội dung sau chỉnh sửa, cùng người duyệt và thời điểm thao tác.

## 5. Gói bằng chứng ẩn danh

Backend tự tổng hợp dữ liệu và gán mã tạm thời cho học sinh. Gói gửi AI chỉ chứa:

- mã tạm thời như `STUDENT_01`;
- môn, khối và nội dung đề cần thiết;
- mã nguồn hoặc sản phẩm học sinh nộp;
- điểm do hệ thống tính;
- từng kết quả test: đạt/chưa đạt, đầu vào khi cần, đầu ra mong đợi, đầu ra thực tế và lỗi;
- năng lực đã ánh xạ;
- bằng chứng theo thời gian, mức thành thạo và xu hướng do hệ thống tính;
- mã dẫn chứng ổn định trong phạm vi lần phân tích.

Không gửi họ tên, tài khoản, email, tên lớp, tên trường, thông tin giáo viên, dữ liệu của học sinh khác hoặc Solution Code nếu không thực sự cần thiết.

## 6. Cấu trúc kết quả AI

AI phải trả về JSON có schema cố định và được kiểm tra cục bộ trước khi lưu.

### 6.1 Bản dành cho giáo viên

- tóm tắt mức độ hiện tại;
- 2–4 điểm mạnh có mã bằng chứng;
- 2–4 nội dung cần củng cố có mã bằng chứng;
- lỗi thường gặp và nguyên nhân có thể có về mặt kiến thức;
- diễn giải xu hướng qua các lần làm;
- năng lực chưa đủ dữ liệu;
- 2–3 mục tiêu ưu tiên cho chu kỳ hai tuần;
- cảnh báo về độ chắc chắn hoặc bằng chứng mâu thuẫn.

### 6.2 Bản dành cho học sinh

- điều em đang làm tốt;
- điều em cần luyện thêm;
- mục tiêu hai tuần tới;
- các bước thực hiện ngắn gọn, tích cực và dễ hiểu.

Bản học sinh không chứa suy đoán nguyên nhân, cảnh báo kỹ thuật nội bộ hoặc ngôn ngữ gắn nhãn năng lực cá nhân.

### 6.3 Kiểm tra kết quả

Validator phải xác nhận:

- đúng schema và giới hạn số lượng;
- mọi mã bằng chứng đều tồn tại trong gói đầu vào;
- không có thông tin định danh bị phản chiếu;
- không có phát biểu bị cấm;
- các mục bắt buộc không rỗng.

Phản hồi sai cấu trúc được sửa một lần có kiểm soát. Nếu vẫn sai, tác vụ chuyển sang nhà cung cấp dự phòng hoặc trạng thái lỗi.

## 7. Kiến trúc xử lý nền

Giáo viên tạo yêu cầu qua API; hệ thống ghi tác vụ vào cơ sở dữ liệu và trả kết quả ngay. Worker nhận tác vụ, khóa bản ghi, tổng hợp bằng chứng, gọi AI, kiểm tra phản hồi và lưu bản nháp. Giao diện thăm dò trạng thái hoặc dùng cơ chế cập nhật sẵn có của dự án.

Việc chạy nền phải có:

- khóa chống hai worker xử lý cùng tác vụ;
- số lần thử và thời điểm thử tiếp theo;
- timeout rõ ràng;
- idempotency để thử lại không tạo bản phân tích trùng;
- lưu lỗi an toàn, không chứa API key hoặc dữ liệu nhạy cảm.

## 8. Định tuyến nhà cung cấp AI

OpenRouter là mặc định, Gemini là dự phòng. Hệ thống chỉ chuyển nhà cung cấp khi có lỗi mạng, timeout, giới hạn tần suất, lỗi máy chủ hoặc phản hồi không đạt schema sau bước sửa có kiểm soát.

Không chuyển nhà cung cấp với lỗi quyền truy cập, dữ liệu đầu vào không hợp lệ hoặc giáo viên không có quyền. Gemini chỉ sẵn sàng khi cấu hình một API key hợp lệ.

Mỗi lần gọi lưu nhà cung cấp, model, token nếu có, thời gian, trạng thái, phiên bản prompt và mã lỗi đã làm sạch.

## 9. Lộ trình cá nhân hai tuần

Mỗi chu kỳ tập trung tối đa 2–3 năng lực ưu tiên.

### Giai đoạn 1: Củng cố nền tảng

Bài dễ, ví dụ ngắn và Starter Code có nhiều hướng dẫn. Mục tiêu là sửa hiểu sai hoặc lấp kiến thức nền còn thiếu.

### Giai đoạn 2: Luyện tập có hướng dẫn

Bài gần với lỗi từng gặp nhưng đổi dữ liệu và bối cảnh, giảm dần gợi ý, có test thường, test biên và test chống hardcode.

### Giai đoạn 3: Kiểm tra lại

Bài mới cùng năng lực nhưng khác ngữ cảnh, ít hoặc không có gợi ý, dùng để xác nhận khả năng vận dụng độc lập.

### 9.1 Chọn hoặc tạo bài

Hệ thống xếp hạng bài có sẵn theo môn, khối, năng lực, độ khó, giai đoạn và lịch sử làm bài. Chỉ khi thiếu bài phù hợp, hệ thống dùng chức năng soạn bài AI hiện có để tạo đủ các khối:

- Description;
- Starter Code;
- Solution Code;
- Autograder Test Cases;
- ánh xạ năng lực.

Mọi bài AI tạo phải được giáo viên duyệt trước khi đưa vào lộ trình hoặc giao cho học sinh.

### 9.2 Điều chỉnh

Sau mỗi bài, hệ thống cập nhật bằng chứng và snapshot bằng quy tắc. Một lần chưa đạt không làm thay đổi toàn bộ lộ trình. Hai bằng chứng liên tiếp cho thấy tiến bộ rõ có thể tạo đề xuất chuyển giai đoạn sớm; nếu chưa đạt, hệ thống đề xuất bài củng cố khác thay vì lặp nguyên đề.

Cuối hai tuần, hệ thống so sánh trước–sau và đề xuất kết thúc, kéo dài hoặc tạo chu kỳ mới. Giáo viên quyết định cuối cùng.

## 10. Mô hình dữ liệu đề xuất

Các tên chính xác có thể điều chỉnh khi lập kế hoạch triển khai, nhưng cần bốn nhóm bảng:

### `student_analysis_jobs`

Lưu lớp, học sinh, giáo viên yêu cầu, phạm vi, dấu vết bằng chứng, trạng thái, lần thử, nhà cung cấp và thông tin lỗi an toàn.

### `student_analysis_reports`

Lưu job, schema version, prompt version, bản AI gốc, bản giáo viên chỉnh sửa, trạng thái duyệt/công bố, người duyệt và mốc thời gian. Báo cáo mới không ghi đè báo cáo cũ.

### `personalized_learning_plans`

Lưu học sinh, lớp, báo cáo nguồn, ngày bắt đầu/kết thúc, năng lực ưu tiên, trạng thái và quyết định của giáo viên.

### `personalized_learning_activities`

Lưu bài tập, giai đoạn, thứ tự, nguồn bài có sẵn hay AI tạo, lý do chọn, trạng thái giao và kết quả đánh giá lại.

Các bảng bật RLS; anon/authenticated không được truy cập trực tiếp. Backend dùng service role sau khi kiểm tra quyền giáo viên hoặc quyền sở hữu dữ liệu của học sinh.

## 11. Kiểm soát chi phí và hiệu năng

- chỉ gọi AI khi giáo viên chủ động yêu cầu;
- mặc định giới hạn 5 bài gần nhất;
- không gửi dữ liệu không cần thiết;
- tái sử dụng báo cáo khi phạm vi và dấu vết bằng chứng không đổi;
- tìm bài trong kho trước khi gọi AI tạo mới;
- đặt giới hạn kích thước mã nguồn và đầu ra test;
- ghi token, model, thời gian và kết quả để theo dõi;
- đặt hạn mức theo giáo viên/ngày bằng cấu hình, không hardcode vào giao diện.

## 12. Quyền truy cập và nhật ký

- giáo viên chỉ phân tích học sinh thuộc lớp mình sở hữu;
- học sinh chỉ xem bản mới nhất đã được công bố của chính mình;
- giáo viên xem được toàn bộ lịch sử của lớp mình;
- lưu nhật ký tạo, thử lại, chỉnh sửa, duyệt, công bố, thu hồi và thay đổi lộ trình;
- không ghi API key, prompt chứa PII hoặc dữ liệu bài làm đầy đủ vào log vận hành.

## 13. Xử lý lỗi và trạng thái lỗi thời

- Khi cả OpenRouter và Gemini thất bại, tác vụ ở `failed` và giáo viên có thể thử lại.
- Bài nộp mới không xóa báo cáo cũ; báo cáo được đánh dấu `stale`.
- Nếu dẫn chứng bị xóa hoặc thay đổi quyền truy cập, liên kết được vô hiệu hóa an toàn.
- Việc công bố thất bại không làm mất bản giáo viên đã chỉnh sửa.
- Worker bị dừng giữa chừng có thể thu hồi tác vụ quá hạn và xử lý lại idempotent.

## 14. Kiểm thử chấp nhận

1. Giáo viên không thể phân tích học sinh ngoài lớp mình.
2. Payload gửi nhà cung cấp không chứa tên, email, tài khoản hoặc tên lớp.
3. Báo cáo có dẫn chứng giả bị validator từ chối.
4. OpenRouter lỗi đủ điều kiện thì Gemini được gọi; lỗi quyền không kích hoạt fallback.
5. Refresh hoặc rời trang không làm mất tác vụ đang chạy.
6. Hai lần bấm cùng phạm vi không tạo hai tác vụ đồng thời.
7. Học sinh không thấy bản nháp hoặc bản chỉ lưu nội bộ.
8. Nội dung giáo viên sửa được bảo toàn khi có báo cáo mới.
9. Lộ trình ưu tiên bài có sẵn và không tự giao bài AI tạo.
10. Bài nộp mới làm báo cáo cũ chuyển sang trạng thái cần phân tích lại.

## 15. Thứ tự triển khai

1. Schema, trạng thái và worker tác vụ phân tích.
2. Tổng hợp bằng chứng ẩn danh, schema đầu ra và kiểm tra an toàn.
3. OpenRouter mặc định, Gemini dự phòng và theo dõi chi phí.
4. Giao diện giáo viên tạo, xem, sửa và duyệt báo cáo.
5. Giao diện học sinh xem bản đã công bố.
6. Lộ trình hai tuần sử dụng kho bài có sẵn.
7. Tích hợp chức năng AI soạn bài khi kho bài thiếu.
8. Đánh giá lại cuối chu kỳ và đề xuất chu kỳ tiếp theo.

## 16. Ngoài phạm vi phiên bản đầu

- phân tích tự động sau mỗi lần nộp;
- phân tích cả lớp theo lô;
- AI tự công bố nhận xét hoặc tự giao bài;
- chẩn đoán tâm lý, thái độ hoặc tiềm năng bẩm sinh;
- thay thế quyết định chuyên môn của giáo viên.
