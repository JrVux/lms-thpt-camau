# Thiết kế xóa lớp vĩnh viễn

## Mục tiêu

Cho phép giáo viên xóa vĩnh viễn một lớp do chính mình sở hữu, đồng thời giảm tối đa nguy cơ thao tác nhầm.

## Phạm vi

- Chỉ giáo viên sở hữu lớp mới thấy và sử dụng chức năng xóa.
- Xóa lớp vĩnh viễn cùng dữ liệu chỉ thuộc lớp: ghi danh, bản giao/bản sao bài tập của lớp, người nhận bài, bài nộp, kết quả chấm và điểm.
- Giữ nguyên các bài tập gốc độc lập trong Kho bài tập.
- Không cho phép khôi phục sau khi xóa thành công.

## Trải nghiệm người dùng

1. Trong trang chi tiết lớp, giáo viên bấm nút `Xóa lớp`.
2. Hệ thống hiển thị đúng một hộp xác nhận, nêu tên lớp và các nhóm dữ liệu sẽ bị xóa.
3. Giáo viên phải nhập chính xác tên lớp. Nút `Xóa vĩnh viễn` chỉ được bật khi tên khớp hoàn toàn.
4. Khi đang xóa, nút bị khóa để tránh gửi lặp.
5. Xóa thành công: đóng hộp thoại, quay về danh sách lớp và làm mới thống kê.
6. Xóa thất bại: giữ nguyên lớp, giữ hộp thoại mở và hiển thị thông báo lỗi.

## Backend và dữ liệu

- Thêm endpoint `DELETE /api/classes/:id`, yêu cầu xác thực và vai trò giáo viên.
- Service đọc lớp theo ID và xác minh `teacher_id` trước khi xóa.
- Việc xóa dựa trên khóa ngoại `ON DELETE CASCADE` cho dữ liệu phụ thuộc.
- Trước khi triển khai, bổ sung migration để bảo đảm bài tập trong Kho bài tập không bị cascade theo lớp. Bài tập gốc độc lập phải có `class_id = NULL`; dữ liệu giao cho lớp bị xóa theo delivery/class.
- Nếu bất kỳ quan hệ dữ liệu nào không có cascade phù hợp, dùng một hàm SQL giao dịch để toàn bộ thao tác cùng thành công hoặc cùng hoàn tác.
- API trả `404` nếu lớp không tồn tại, `403` nếu không sở hữu và `200` khi xóa thành công.

## An toàn và lỗi

- Không tin tên lớp do frontend gửi để phân quyền; tên chỉ là lớp bảo vệ thao tác nhầm trên giao diện.
- Backend luôn kiểm tra quyền sở hữu bằng người dùng trong token.
- Không xóa tài khoản học sinh; chỉ xóa liên kết ghi danh và dữ liệu của lớp.
- Không xóa lớp từng phần. Lỗi cơ sở dữ liệu phải giữ nguyên toàn bộ dữ liệu.

## Kiểm thử

- Service từ chối giáo viên không sở hữu lớp.
- Service báo không tìm thấy lớp.
- Xóa lớp sở hữu thành công.
- Dữ liệu phụ thuộc của lớp bị xóa, tài khoản học sinh và bài Kho bài tập còn nguyên.
- Endpoint chỉ dành cho giáo viên.
- Giao diện khóa nút khi tên chưa khớp, ngăn gửi hai lần, điều hướng sau thành công và hiển thị lỗi khi thất bại.
- Chạy toàn bộ kiểm thử backend, frontend và production build trước khi triển khai.

## Tiêu chí hoàn tất

- Giáo viên có thể xóa lớp vĩnh viễn qua đúng một lần xác nhận bằng cách nhập tên lớp.
- Không giáo viên nào xóa được lớp của người khác.
- Không còn dữ liệu lớp mồ côi.
- Kho bài tập và tài khoản học sinh không bị ảnh hưởng.
- Bản triển khai production được kiểm tra cả API và giao diện.
