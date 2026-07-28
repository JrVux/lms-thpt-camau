# Thiết kế README và hướng dẫn sử dụng trực quan

## Mục tiêu

Cập nhật tài liệu dự án theo đúng trạng thái production và cung cấp một cẩm nang tiếng Việt đẹp, hiện đại, dễ sử dụng cho cả giáo viên và học sinh.

## Sản phẩm

### README

- Giới thiệu ngắn gọn giá trị của hệ thống.
- Liệt kê đầy đủ tính năng hiện có: Kho bài tập 10/11/12/Nâng cao, giao bài độc lập hoặc đồng bộ, chỉ định học sinh, tự chấm lại, xem bài nộp, xuất điểm và xóa lớp an toàn.
- Cập nhật URL production, kiến trúc, biến môi trường, thứ tự migration `001` đến `008`, lệnh kiểm thử/build và API endpoint.
- Thêm liên kết nổi bật đến cẩm nang trực quan.
- Loại bỏ hoặc sửa thông tin triển khai đã lỗi thời.

### Cẩm nang trực quan

- Tạo file độc lập `docs/huong-dan-su-dung.html`.
- Xuất bản PDF A4 tại `output/pdf/cam-nang-su-dung-lms-thpt.pdf` để gửi trực tiếp.
- Responsive trên máy tính và điện thoại, không cần build hoặc server.
- Phông chính `Be Vietnam Pro`; có font dự phòng hệ thống khi không có mạng.
- Thiết kế sáng, dễ đọc; màu xanh cho giáo viên, tím cho học sinh, đỏ cho cảnh báo.
- Có mục lục cố định, nút chuyển nhanh giữa hai vai trò và thanh tiến trình đọc.
- Dùng CSS illustration, icon SVG nội tuyến và các khung mô phỏng giao diện; không phụ thuộc ảnh chụp màn hình dễ lỗi thời.

## Nội dung hướng dẫn

### Giáo viên

1. Đăng nhập và tạo lớp theo khối.
2. Quản lý học sinh và mã lớp.
3. Tạo bài trong Kho bài tập theo khối hoặc Nâng cao.
4. Giao bài cho cả lớp hoặc học sinh cụ thể.
5. Chọn bản độc lập hoặc liên kết đồng bộ.
6. Theo dõi bảng điểm và mở bài làm chi tiết.
7. Chấm lại theo phiên bản mới và xuất CSV/Excel.
8. Xóa lớp bằng xác nhận nhập đúng tên.

### Học sinh

1. Đăng ký/đăng nhập và tham gia lớp bằng mã.
2. Xem bài tập được giao.
3. Làm bài Python, SQL hoặc HTML.
4. Chạy thử, nộp bài, xem kết quả test và số lần còn lại.
5. Làm lại hoặc xử lý yêu cầu chấm lại.

### Trợ giúp

- Không thấy bài tập.
- Không xem được bài nộp.
- Phiên đăng nhập hết hạn.
- Trang chưa cập nhật sau triển khai.
- Nguyên tắc an toàn khi xóa lớp.

## Khả năng tiếp cận

- Semantic HTML, heading đúng thứ tự và liên kết bỏ qua điều hướng.
- Tương phản màu rõ, focus keyboard dễ nhận biết.
- Không truyền đạt trạng thái chỉ bằng màu.
- Tôn trọng `prefers-reduced-motion`.
- Cỡ chữ và khoảng chạm phù hợp trên điện thoại.

## Kiểm tra

- Kiểm tra liên kết và nội dung bắt buộc bằng Node test.
- Kiểm tra HTML không có tài nguyên ảnh từ bên ngoài.
- Mở bằng trình duyệt ở kích thước desktop/mobile.
- Xác nhận README khớp migration, endpoint và URL production trong mã nguồn.
- Kiểm tra PDF bằng trích xuất văn bản, render toàn bộ trang thành PNG và quan sát trực tiếp.
