# Thiết kế AI soạn bài, phân tích năng lực và lộ trình cá nhân hóa

**Ngày:** 2026-08-15  
**Trạng thái:** Đã thống nhất qua trao đổi, chờ duyệt đặc tả bằng văn bản  
**Phạm vi thử nghiệm:** Python lớp 10

## 1. Mục tiêu

Bổ sung hai mô-đun AI liên kết với nhau cho LMS THPT Cà Mau:

1. **Trợ lý soạn bài:** giáo viên nhập yêu cầu hoặc dán một bài mẫu; AI tạo đầy đủ nội dung bài tập và tự điền biểu mẫu hiện tại.
2. **Phân tích năng lực:** hệ thống đo năng lực từ bằng chứng có cấu trúc; AI diễn giải kết quả, tạo nhận xét nháp và đề xuất lộ trình bồi dưỡng cá nhân.

AI không tự xuất bản bài, không tự chia sẻ nhận xét và không tự giao bài. Giáo viên luôn là người duyệt cuối cùng.

## 2. Nguyên tắc thiết kế

- Điểm và mức thành thạo do quy tắc xác định, không do mô hình ngôn ngữ tự đặt.
- Mọi nhận xét quan trọng phải truy ngược được đến bài nộp hoặc test cụ thể.
- Không suy đoán thái độ, trí thông minh, hoàn cảnh hay phẩm chất của học sinh.
- Dữ liệu gửi AI phải ẩn danh; không gửi họ tên, email hoặc thông tin nhận diện.
- AI hỏng không được làm gián đoạn việc làm bài, chấm điểm hoặc xem bảng điểm.
- Prompt, rubric, khung năng lực và kết quả AI đều có phiên bản để truy vết.
- Ưu tiên bài đã được giáo viên kiểm chứng trong Kho bài tập.

## 3. Kiến trúc tổng thể

Luồng soạn bài:

`Yêu cầu/bài mẫu → nhận diện môn → template BTcodehs theo phiên bản → AI sinh JSON → kiểm tra → điền form → giáo viên sửa và lưu`

Luồng phân tích:

`Bài/test đã gắn kỹ năng → kết quả nhiều lần nộp → bộ máy tính năng lực → AI tạo nhận xét nháp → giáo viên duyệt → lộ trình → giáo viên duyệt và giao bài`

Backend là nơi duy nhất gọi dịch vụ AI. Một lớp adapter trung gian tách nghiệp vụ khỏi nhà cung cấp và mô hình cụ thể.

## 4. Trợ lý AI soạn bài tập

### 4.1. Trải nghiệm giáo viên

Trang tạo bài có nút **Soạn bằng AI**. Giáo viên có thể:

- Nhập yêu cầu ngắn bằng tiếng Việt; hoặc
- Dán nội dung một bài mẫu dạng văn bản.

Phiên bản đầu không đọc Word, PDF hoặc ảnh. Giáo viên có thể cung cấp mức độ, chủ đề hoặc yêu cầu bổ sung nhưng các trường này không bắt buộc.

AI tạo bản nháp và điền form hiện tại. Bản nháp chưa được lưu hoặc xuất bản cho đến khi giáo viên bấm lưu.

### 4.2. Kết quả có cấu trúc

AI phải trả JSON theo schema được backend kiểm tra, gồm:

- Tên bài, môn, khối, nhóm bài, độ khó và tổng điểm.
- Description có yêu cầu rõ ràng, ví dụ và checklist khi phù hợp.
- Starter Code có hướng dẫn nhưng không tiết lộ lời giải.
- Solution Code ngắn gọn và đúng yêu cầu.
- Với SQL: `setup_sql`, truy vấn mẫu và kết quả mong đợi đúng định dạng.
- Test cases: tên không dấu, dữ liệu vào, kết quả mong đợi, điểm, loại test và kỹ năng được kiểm tra.
- Metadata: kỹ năng, mức nhận thức, độ khó và lý do gắn nhãn.
- Với HTML/CSS: selector dùng để chấm tự động và rubric thẩm mỹ chấm thủ công.

Backend chuyển JSON này vào các trường hiện có của `assignments` và `test_cases`; không phân tích Markdown bốn khối để lưu dữ liệu.

### 4.3. Bộ quy tắc BTcodehs

Quy tắc chung và reference riêng cho Python, SQL, HTML/CSS được quản lý như template có phiên bản. Chỉ quản trị viên cập nhật template chuẩn; giáo viên chỉ thêm yêu cầu cho từng bài.

Quy tắc bắt buộc:

- Tối thiểu ba test: trường hợp thường, biên và chống hardcode.
- Python dùng chiến lược so khớp output chịu được khác biệt khoảng trắng phù hợp với runner của dự án; có ít nhất hai bộ input khác nhau khi bài dùng input.
- SQL có setup chạy trước, kết quả mong đợi là mảng hai chiều và bảo toàn thứ tự khi đề yêu cầu `ORDER BY`.
- HTML/CSS dùng selector hợp lệ; không tuyên bố chấm được nội dung hay thẩm mỹ khi autograder không kiểm tra được.

### 4.4. Kiểm tra trước khi điền form

- JSON đúng schema và đủ trường bắt buộc.
- Tổng điểm test khớp tổng điểm bài.
- Starter Code không chứa lời giải hoàn chỉnh.
- Description, lời giải và test nhất quán.
- Solution Code vượt toàn bộ test khi runner cho phép kiểm tra an toàn.
- SQL setup chạy được; HTML/CSS selector phân tích được.
- Kỹ năng, độ khó và khối lớp nằm trong khung đã duyệt.

Nếu kiểm tra không đạt, hệ thống thử sửa có giới hạn rồi hiển thị lỗi cụ thể; không điền âm thầm dữ liệu không hợp lệ.

### 4.5. Chỉnh sửa từng phần

Giáo viên có thể tạo lại hoặc ra lệnh AI sửa riêng Description, Starter Code, Solution Code hoặc Autograder. Hệ thống giữ nguyên các phần khác đã duyệt. Sau mọi thay đổi có ảnh hưởng chéo, toàn bộ bài được kiểm tra lại tính nhất quán.

## 5. Khung năng lực và dữ liệu

Khung mặc định bám Chương trình GDPT 2018 môn Tin học và năng lực lập trình thực hành. Giáo viên được bổ sung hoặc điều chỉnh kỹ năng trong phạm vi môn/lớp của mình.

Các nhóm dữ liệu mới:

- **Competency framework:** môn, khối, chủ đề, kỹ năng, mô tả, điều kiện tiên quyết và phiên bản.
- **Assignment skill mapping:** kỹ năng, độ khó, trọng số và trạng thái duyệt cho từng bài/test.
- **Competency evidence:** bằng chứng sinh từ từng lần nộp, test, loại lỗi và sự thay đổi qua các lần làm.
- **Mastery snapshot:** mức thành thạo, độ tin cậy, xu hướng và thời điểm tính cho mỗi học sinh/kỹ năng.
- **AI analysis:** phạm vi dữ liệu, phiên bản prompt/model/rubric, nhận xét nháp, dẫn chứng và trạng thái.
- **Learning plan:** mục tiêu, kỹ năng ưu tiên, bài đề xuất, thứ tự, tiêu chí hoàn thành và trạng thái duyệt.
- **Review history:** nội dung AI, chỉnh sửa của giáo viên, người duyệt và thời điểm chia sẻ/giao bài.

AI đề xuất kỹ năng và độ khó của bài/test; giáo viên phải duyệt trước khi dữ liệu được dùng để đánh giá.

## 6. Mô hình đánh giá năng lực

Mỗi kỹ năng có hai chỉ số độc lập:

- **Mức thành thạo 0–100:** kết quả học sinh thể hiện.
- **Độ tin cậy 0–100:** mức đầy đủ và đa dạng của bằng chứng.

Thang diễn giải mặc định:

- 0–39: Chưa hình thành.
- 40–59: Đang hình thành.
- 60–79: Đạt.
- 80–100: Thành thạo.

Khi độ tin cậy dưới ngưỡng cấu hình, giao diện hiển thị **Chưa đủ dữ liệu** thay vì gắn nhãn yếu.

Mức thành thạo kết hợp:

- Kết quả test đã gắn kỹ năng.
- Độ khó và trọng số đã duyệt.
- Trọng số thời gian, ưu tiên bằng chứng gần đây.
- Số lần thử và mức cải thiện.
- Khả năng vận dụng cùng kỹ năng ở nhiều bài khác nhau.

Phân tích mã dùng rubric: tính đúng, cách giải, cấu trúc, khả năng đọc hiểu, hiệu quả và lỗi thường gặp. Kết quả này là bằng chứng bổ sung, không thay điểm autograder.

Ngưỡng và trọng số được cấu hình theo phiên bản. Báo cáo cũ tiếp tục tham chiếu phiên bản đã dùng khi tạo.

## 7. Nhận xét AI và quyền riêng tư

Giáo viên chủ động bấm **Phân tích** và chọn học sinh hoặc phạm vi thời gian. Backend tạo gói bằng chứng đã ẩn danh gồm mã định danh tạm, đề bài cần thiết, mã nguồn, test, lỗi, kỹ năng và lịch sử tiến bộ.

AI trả dữ liệu có cấu trúc:

- Điểm mạnh.
- Nội dung cần củng cố.
- Lỗi điển hình.
- Dẫn chứng cho từng kết luận.
- Gợi ý mục tiêu tiếp theo.
- Cảnh báo khi dữ liệu không đủ hoặc kết luận không chắc chắn.

Tên, email, tên lớp và thông tin nhận diện không được đưa vào prompt. Khóa AI chỉ nằm ở backend. Giáo viên phải duyệt hoặc chỉnh sửa trước khi chia sẻ nhận xét.

## 8. Lộ trình cá nhân hóa

Lộ trình gồm mục tiêu ngắn hạn, kỹ năng ưu tiên, thứ tự học, bài đề xuất và tiêu chí hoàn thành.

Hệ thống ưu tiên chọn bài đã có trong Kho bài tập dựa trên kỹ năng, độ khó và điều kiện tiên quyết. Nếu thiếu bài phù hợp, AI dùng Trợ lý soạn bài để tạo bản nháp; giáo viên duyệt và lưu vào kho trước khi giao.

AI không tự giao bài. Giáo viên có thể sửa mục tiêu, thay bài, đổi thứ tự hoặc từ chối toàn bộ lộ trình.

## 9. Giao diện

Trong mỗi lớp bổ sung tab **Phân tích năng lực**:

### Tổng quan lớp

- Phân bố theo kỹ năng.
- Kỹ năng cả lớp cần củng cố hoặc đang tiến bộ.
- Học sinh thiếu dữ liệu, lặp lỗi hoặc chững tiến bộ.
- Không dùng bảng xếp hạng năng lực.

### Hồ sơ học sinh

- Bản đồ kỹ năng và xu hướng theo thời gian.
- Điểm mạnh, nội dung cần củng cố và lỗi điển hình.
- Liên kết từ nhận xét đến bài/test làm bằng chứng.
- Phân biệt rõ chỉ số hệ thống và văn bản do AI tạo.

### Lộ trình cá nhân

- Mục tiêu và kỹ năng ưu tiên.
- Bài đề xuất theo thứ tự.
- Trạng thái đủ bài trong kho hoặc cần AI tạo bài mới.
- Thao tác sửa, duyệt, chia sẻ và giao bài.

## 10. Hiệu năng và chi phí

- Chỉ gửi phần dữ liệu mới kể từ lần phân tích gần nhất.
- Không yêu cầu AI tính lại các chỉ số có thể tính bằng quy tắc.
- Gộp nhiều kỹ năng của một học sinh trong một yêu cầu phù hợp giới hạn ngữ cảnh.
- Cache theo phiên bản dữ liệu, prompt, rubric và model.
- Có hạn mức theo giáo viên/lớp và ước tính chi phí trước tác vụ hàng loạt.
- Dùng mô hình nhỏ cho phân loại/nhận xét thường ngày; chuyển mô hình mạnh hơn khi phân tích mã phức tạp hoặc tạo bài mới.

## 11. Lỗi và trạng thái an toàn

- AI lỗi hoặc quá thời gian: giữ nguyên dữ liệu định lượng và cho phép thử lại.
- Output sai schema: thử sửa có giới hạn, sau đó đánh dấu thất bại.
- Nhận xét thiếu dẫn chứng hoặc mâu thuẫn dữ liệu: không cho duyệt tự động.
- Không chia sẻ nhận xét hoặc giao bài ở trạng thái chưa duyệt.
- Lưu nhật ký gọi AI, phiên bản prompt, trạng thái, chi phí ước tính và lịch sử chỉnh sửa; không ghi thông tin nhạy cảm không cần thiết vào log.

## 12. Kiểm thử và tiêu chí nghiệm thu

- Cùng dữ liệu và cùng phiên bản cấu hình tạo chỉ số định lượng giống nhau.
- Mọi nhận xét quan trọng có ít nhất một dẫn chứng hợp lệ.
- Không có dữ liệu định danh trong payload gửi AI.
- Giáo viên chỉ xem và phân tích học sinh thuộc lớp mình sở hữu.
- AI ngừng hoạt động không ảnh hưởng chấm điểm và làm bài.
- Giáo viên có thể sửa, từ chối và tạo lại nhận xét/lộ trình.
- Lộ trình tuân thủ điều kiện tiên quyết và không đề xuất bài ngoài môn/khối sai quy tắc.
- Bài AI tạo có schema hợp lệ, đủ test, tổng điểm đúng và lời giải vượt test khi runner hỗ trợ.
- Kiểm thử riêng Python, SQL và HTML/CSS theo đặc thù runner hiện có.

## 13. Lộ trình triển khai

1. **Nền tảng:** khung năng lực, mapping kỹ năng, phiên bản rubric và bộ máy tính mastery/confidence.
2. **Soạn bài AI:** sinh JSON, kiểm tra, điền form và chỉnh từng phần; thử nghiệm Python lớp 10.
3. **Nhận xét AI:** gói bằng chứng ẩn danh, báo cáo có dẫn chứng và quy trình giáo viên duyệt.
4. **Lộ trình cá nhân:** chọn bài trong kho, tạo bản nháp khi thiếu và giao sau khi duyệt.
5. **Mở rộng:** SQL lớp 11, HTML/CSS lớp 12, sau đó mới cân nhắc nhập Word/PDF/ảnh và tự động hóa theo lịch.

## 14. Ngoài phạm vi phiên bản đầu

- AI tự động giao bài hoặc tự động chia sẻ nhận xét.
- Đánh giá thái độ, trí thông minh hoặc phẩm chất cá nhân.
- Đọc Word, PDF hoặc ảnh đề bài.
- Phân tích tự động sau mỗi lần nộp.
- Bảng xếp hạng năng lực học sinh.
- Thay thế quyết định chuyên môn của giáo viên.
