# Thiết kế chấm tự luận AI theo phần trăm đáp án mẫu

Ngày: 2026-09-10

## 1. Mục tiêu

Đơn giản hóa cấu hình chấm tự luận bằng AI: giáo viên chỉ cung cấp đề bài, đáp án mẫu và điểm tối đa. Giáo viên không phải tạo rubric hoặc chia đáp án thành các ý có điểm.

AI so sánh bài làm với đáp án mẫu theo ý nghĩa, đề xuất tỷ lệ nội dung đúng và giải thích chi tiết. Mọi kết quả AI chỉ là bản nháp; giáo viên phải xem lại, có thể chỉnh sửa và phê duyệt trước khi công bố cho học sinh.

## 2. Nguyên tắc bắt buộc

- Đáp án mẫu do giáo viên nhập là nguồn tham chiếu chính thức. AI không tự tạo hoặc thay thế đáp án mẫu.
- Không yêu cầu giáo viên cấu hình rubric, tiêu chí hay mốc điểm trước khi giao bài.
- Không chấm bằng so khớp từ khóa đơn thuần. Phải chấp nhận cách diễn đạt tương đương nếu đúng nghĩa.
- Không tự công bố điểm. Giáo viên luôn là người quyết định kết quả cuối cùng.
- Nội dung bài làm là dữ liệu không tin cậy, không phải chỉ dẫn cho AI.
- Khi file hoặc chữ không đủ rõ, hệ thống phải cảnh báo để giáo viên kiểm tra, không tự động cho 0 điểm.
- Đáp án mẫu không được gửi cho học sinh trừ khi giáo viên chủ động bật quyền xem sau khi công bố.

## 3. Trải nghiệm tạo bài

Khi bật `Chấm tự luận tự động bằng AI`, giao diện yêu cầu:

- Đáp án mẫu đầy đủ.
- Điểm tối đa lớn hơn 0.
- Các định dạng file được hệ thống chấm AI hỗ trợ.

Giao diện bỏ toàn bộ phần `Nội dung cốt lõi và thang điểm`, nút thêm/xóa tiêu chí và kiểm tra tổng điểm rubric. Phần mô tả phải nói rõ rằng AI sẽ tính tỷ lệ đúng dựa trên đáp án mẫu và giáo viên phải duyệt kết quả.

Tùy chọn `Cho học sinh xem đáp án mẫu trong kết quả đã công bố` tiếp tục được giữ nguyên.

## 4. Cách AI đánh giá

AI nhận đề bài, snapshot đáp án mẫu, điểm tối đa và nội dung trích xuất từ bài nộp. AI phải:

1. Hiểu nội dung cần trả lời từ đề bài và đáp án mẫu.
2. So sánh theo nghĩa, chấp nhận cách diễn đạt tương đương và thứ tự trình bày khác nhau.
3. Không cộng điểm cho nội dung dài nhưng không liên quan.
4. Phân biệt nội dung đúng, nội dung thiếu, nội dung sai và nội dung mâu thuẫn với đáp án.
5. Gắn nhận định với dẫn chứng ngắn lấy từ bài làm khi có thể.
6. Trả độ tin cậy và cảnh báo chất lượng trích xuất.

AI trả một đối tượng có cấu trúc gồm:

- `correctness_percentage`: số từ 0 đến 100.
- `overall_feedback`: nhận xét tổng hợp.
- `correct_content`: danh sách nội dung làm đúng, mỗi mục có mô tả và dẫn chứng.
- `missing_or_incorrect_content`: danh sách nội dung thiếu hoặc sai, mỗi mục có mô tả và giải thích.
- `contradictions`: danh sách nội dung mâu thuẫn rõ ràng với đáp án mẫu.
- `strengths`: các điểm làm tốt.
- `improvements`: hướng cải thiện.
- `confidence`: số từ 0 đến 1.
- `extraction_quality` và `extraction_warnings`: chất lượng đọc file và các cảnh báo.

Các danh sách phân tích được AI tạo sau khi so sánh để giải thích kết quả; chúng không phải rubric do giáo viên cấu hình và không mang điểm riêng.

## 5. Quy đổi điểm

Backend là nguồn chân lý cho phép tính điểm:

`ai_score = round_to_0_1(max_score * correctness_percentage / 100)`

Trong đó `round_to_0_1` làm tròn đến một chữ số thập phân. Ví dụ, 83% trên thang 10 được đề xuất là 8,3 điểm.

Backend phải từ chối output có phần trăm ngoài khoảng 0–100, điểm không hữu hạn, nội dung giải thích sai schema hoặc vượt giới hạn độ dài. Điểm do AI gửi lên không được tin cậy; backend luôn tự tính lại từ phần trăm hợp lệ.

## 6. Luồng giáo viên duyệt

Màn hình duyệt hiển thị cạnh bản xem trước bài nộp:

- Phần trăm đúng do AI đề xuất.
- Điểm đề xuất trên điểm tối đa.
- Nội dung đúng và dẫn chứng.
- Nội dung thiếu/sai cùng giải thích.
- Nội dung mâu thuẫn.
- Nhận xét tổng hợp, điểm mạnh, hướng cải thiện.
- Chất lượng trích xuất, cảnh báo và độ tin cậy.

Giáo viên có thể chỉnh:

- Phần trăm đúng từ 0 đến 100.
- Điểm cuối cùng từ 0 đến điểm tối đa; thay đổi điểm sẽ đồng bộ ngược lại phần trăm.
- Nhận xét gửi học sinh.
- Quyền xem đáp án mẫu sau công bố.

Khi giáo viên sửa phần trăm, giao diện tự tính lại điểm theo công thức và làm tròn 0,1. Khi giáo viên sửa điểm, giao diện tính ngược `phần trăm = điểm / điểm tối đa × 100` và làm tròn 0,1%. Hai giá trị luôn đồng bộ trước khi lưu; hệ thống lưu cả phần trăm đã duyệt và điểm đã duyệt để bảo toàn quyết định của giáo viên.

Các trạng thái `Lưu bản duyệt`, `Từ chối bản chấm`, `Phê duyệt`, `Công bố` và `Thu hồi kết quả` tiếp tục được giữ. Chỉ kết quả đã phê duyệt mới được công bố.

## 7. Kết quả học sinh

Trước khi công bố, API học sinh không được trả điểm AI, phần trăm, nội dung trích xuất, phân tích chi tiết hoặc đáp án mẫu.

Sau khi công bố, học sinh thấy:

- Điểm giáo viên đã duyệt trên điểm tối đa.
- Phần trăm đúng đã duyệt.
- Nhận xét giáo viên.
- Phần nội dung đúng.
- Phần nội dung thiếu/sai và hướng cải thiện.
- Đáp án mẫu chỉ khi giáo viên đã bật quyền xem.

Không hiển thị raw OCR, log provider, prompt, API key, object key hoặc dữ liệu nội bộ.

## 8. Dữ liệu và tương thích ngược

Các trường rubric hiện có và snapshot rubric không bị xóa trong thay đổi này để tránh làm hỏng bài, job và báo cáo cũ.

Bài mới dùng chế độ chấm phần trăm và lưu snapshot đáp án mẫu như hiện tại. Báo cáo mới bổ sung dữ liệu phần trăm và các nhóm giải thích chi tiết. Báo cáo rubric cũ tiếp tục được hiển thị theo giao diện cũ; báo cáo phần trăm mới dùng giao diện mới.

Mỗi báo cáo hoặc job phải có phiên bản phương pháp chấm rõ ràng, ví dụ `rubric_v1` hoặc `percentage_v2`, để backend và frontend chọn đúng validator và cách hiển thị. Không suy đoán phương pháp chỉ dựa vào trường nullable.

## 9. Xử lý lỗi

- Thiếu đáp án mẫu hoặc điểm tối đa không hợp lệ: chặn lưu cấu hình.
- File không đọc được hoặc nội dung trống: đánh dấu job thất bại/cần kiểm tra, không tạo điểm 0.
- Chất lượng trích xuất không chắc chắn: vẫn có thể tạo bản nháp nếu còn đủ nội dung, nhưng hiển thị cảnh báo nổi bật.
- AI timeout hoặc output sai schema: retry theo giới hạn hiện có; sau đó hiển thị lỗi an toàn cho giáo viên.
- Phần trăm hoặc dữ liệu giải thích không hợp lệ: từ chối toàn bộ output, không lưu như kết quả hợp lệ.
- Giáo viên nhập phần trăm/điểm ngoài giới hạn: chặn lưu và giải thích lỗi cụ thể.

## 10. Kiểm thử bắt buộc

### Backend

- Cấu hình bài mới chỉ yêu cầu đáp án mẫu và điểm tối đa, không yêu cầu rubric.
- Validator chấp nhận 0%, 100% và phần trăm thập phân hợp lệ; từ chối giá trị âm, lớn hơn 100, NaN và Infinity.
- Backend tự tính điểm và làm tròn 0,1; không tin điểm do AI cung cấp.
- Output thiếu giải thích, dẫn chứng sai kiểu hoặc nội dung quá dài bị từ chối.
- Prompt yêu cầu so sánh theo nghĩa, chống prompt injection từ bài làm và xử lý nội dung không rõ.
- Giáo viên có thể chỉnh phần trăm hoặc điểm trong giới hạn; giá trị còn lại được đồng bộ theo công thức trước khi lưu.
- Chỉ báo cáo đã duyệt mới được công bố.
- API học sinh không rò rỉ dữ liệu trước công bố.
- Job/báo cáo rubric cũ vẫn hoạt động.

### Frontend

- Form tạo bài không còn trình soạn rubric.
- Thiếu đáp án mẫu thì không thể lưu khi bật AI.
- Màn hình duyệt hiển thị phần trăm, điểm đề xuất, phân tích đúng/thiếu/sai/mâu thuẫn, dẫn chứng và cảnh báo.
- Sửa phần trăm tự tính lại điểm đề xuất theo bước 0,1.
- Sửa điểm cuối cùng không vượt điểm tối đa và đồng bộ ngược lại phần trăm.
- Học sinh chỉ thấy dữ liệu đã công bố và chỉ thấy đáp án mẫu khi được cho phép.

## 11. Ngoài phạm vi

- AI tự tạo đáp án mẫu.
- AI tự công bố kết quả.
- Chấm bằng từ khóa cố định hoặc độ giống văn bản thuần túy.
- Xóa ngay các trường rubric hoặc chuyển đổi dữ liệu lịch sử.
- Thay đổi nhà cung cấp AI hoặc gửi bài làm sang nhà cung cấp dự phòng khác.
- Triển khai production; đây là bước phê duyệt riêng sau khi hoàn thành và kiểm thử cục bộ.
