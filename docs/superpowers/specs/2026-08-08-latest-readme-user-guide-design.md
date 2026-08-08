# Thiết kế cập nhật README và cẩm nang sử dụng

## Mục tiêu

Đồng bộ tài liệu với phiên bản production tại commit `eaacd41`, giao diện OmniRoute và các luồng nghiệp vụ hiện có. README phục vụ lập trình viên/quản trị viên; cẩm nang HTML/PDF phục vụ giáo viên và học sinh.

## Phạm vi

### README kỹ thuật

- Giới thiệu ngắn gọn hệ thống và liên kết production hiện hành.
- Mô tả đúng tính năng theo vai trò, kiến trúc frontend/backend/database và cơ chế chạy mã trong trình duyệt.
- Cập nhật hướng dẫn cài đặt local, biến môi trường bằng giá trị mẫu an toàn, migrations, kiểm thử và triển khai Vercel/Render.
- Giữ phần API chính và xử lý nhanh, nhưng chỉnh tên màn hình/nút theo giao diện hiện tại.
- Không đưa token, secret hoặc thông tin xác thực thật vào tài liệu.

### Cẩm nang HTML

- Giữ một file HTML độc lập, responsive, có thể mở trực tiếp và in ra PDF.
- Giữ phong cách minh họa bằng HTML/CSS thay vì ảnh chụp giao diện để hạn chế lỗi thời.
- Đồng bộ nhận diện và thuật ngữ với giao diện OmniRoute: `Lớp của tôi`, `Kho bài tập`, `Lớp học`, `Bài tập của tôi`, `Bảng điểm` và các nhãn hành động thực tế.
- Trình bày lộ trình giáo viên: đăng ký/đăng nhập, tạo lớp, quản lý học sinh, tạo bài, giao bài đúng đối tượng, chọn chế độ đồng bộ, xem/chấm lại bài, xuất điểm và xóa lớp.
- Trình bày lộ trình học sinh: tạo tài khoản, tham gia lớp, tìm bài được giao, chạy thử Python/SQL/HTML, nộp bài, xem điểm và làm lại.
- Bổ sung tra cứu nhanh, cảnh báo thao tác không thể hoàn tác và xử lý lỗi thường gặp.

### Cẩm nang PDF

- Sinh lại `output/pdf/cam-nang-su-dung-lms-thpt.pdf` từ HTML bằng script hiện có.
- PDF A4 phải giữ đủ nội dung, không bị cắt chữ hoặc tràn khung.
- File PDF ngoài root đang là file không được theo dõi và không thuộc phạm vi thay đổi.

## Nguyên tắc nội dung

- Tiếng Việt rõ ràng, câu ngắn và ưu tiên thao tác/kết quả nhìn thấy.
- Mỗi hướng dẫn dùng đúng vai trò và không hứa chức năng chưa có trong mã nguồn.
- Giá trị cấu hình nhạy cảm chỉ dùng placeholder.
- HTML là nguồn duy nhất của nội dung cẩm nang; PDF chỉ là bản xuất để tránh sai lệch.

## Kiểm chứng

- Mở rộng test tài liệu để kiểm tra URL production, các mục bắt buộc, thuật ngữ OmniRoute, liên kết HTML/PDF và không có secret fingerprint.
- Chạy `npm run test:docs`.
- Render cẩm nang HTML ở desktop/mobile để kiểm tra bố cục.
- Xuất PDF, trích xuất văn bản và render các trang để kiểm tra trực quan.
- Chạy kiểm tra liên kết nội bộ và xác nhận các lệnh README tồn tại trong `package.json`.

## Ngoài phạm vi

- Không thay đổi chức năng ứng dụng, API, database hoặc cấu hình production.
- Không tạo bộ ảnh chụp màn hình.
- Không sửa các file `.env.example` ngoài những gì tài liệu cần tham chiếu; mọi rủi ro secret trong cấu hình nguồn sẽ được báo riêng thay vì âm thầm thay đổi.
