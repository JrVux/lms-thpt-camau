# Thiết kế chia sẻ bài tập độc lập giữa các lớp cùng khối

## Mục tiêu

Cho phép giáo viên sao chép một hoặc nhiều bài tập từ một lớp sang các lớp khác cùng khối do chính giáo viên đó quản lý. Mỗi bản sao là một bài tập độc lập, luôn bắt đầu ở trạng thái nháp và có thể được chỉnh sửa, đặt hạn nộp, publish cũng như nhận bài nộp riêng.

## Phạm vi

- Chỉ giáo viên sở hữu lớp nguồn mới được chia sẻ bài tập từ lớp đó.
- Chỉ các lớp đích cùng khối với lớp nguồn và thuộc cùng giáo viên được phép nhận bản sao.
- Có thể chọn một hoặc nhiều bài tập và một hoặc nhiều lớp đích trong một lần chia sẻ.
- Không chia sẻ sang lớp của giáo viên khác.
- Không tạo thư viện bài tập dùng chung hoặc liên kết đồng bộ giữa các bản sao.

## Trải nghiệm giao diện

Trong tab **Bài tập**, giáo viên chọn một hoặc nhiều bài rồi nhấn **Chia sẻ**. Cửa sổ chia sẻ chỉ hiển thị các lớp:

1. thuộc giáo viên đang đăng nhập;
2. có cùng khối với lớp nguồn;
3. không phải lớp nguồn.

Giáo viên chọn các lớp đích và thực hiện sao chép. Kết quả hiển thị số bản sao thành công, số bản sao thất bại và lỗi cụ thể nếu có. Bản sao xuất hiện trong lớp đích dưới trạng thái **Nháp**. Giáo viên vào từng lớp để chỉnh sửa và publish riêng.

Nếu không có lớp đích hợp lệ, giao diện thông báo rằng giáo viên chưa có lớp khác cùng khối.

## Mô hình dữ liệu và tính độc lập

Không cần migration cơ sở dữ liệu. Cơ chế hiện tại tiếp tục tạo một hàng `assignments` mới cho mỗi cặp bài tập–lớp đích.

Mỗi bản sao:

- có `assignments.id` mới;
- có `class_id` của lớp đích;
- có `is_published = false`;
- giữ giá trị ban đầu của tiêu đề, mô tả, loại bài, code mẫu, lời giải, SQL thiết lập, mã kiểm thử, hạn nộp, số lần nộp tối đa và điểm tối đa;
- có các hàng `test_cases` mới với ID mới và `assignment_id` trỏ tới bản sao;
- không sao chép bài nộp hoặc kết quả bài nộp.

Do ID bài tập và test case khác nhau, mọi chỉnh sửa, publish, bảng điểm và bài nộp của từng lớp không ảnh hưởng lớp nguồn hoặc lớp đích khác.

## API và kiểm soát quyền

Giữ endpoint:

`POST /api/classes/:id/assignments/share`

Payload:

```json
{
  "target_class_ids": ["uuid"],
  "assignment_ids": ["uuid"]
}
```

Backend thực hiện các kiểm tra sau:

1. lớp nguồn tồn tại và thuộc giáo viên đang đăng nhập;
2. tất cả lớp đích tồn tại;
3. tất cả lớp đích thuộc cùng giáo viên;
4. tất cả lớp đích có cùng `grade` với lớp nguồn;
5. không có lớp đích nào trùng lớp nguồn;
6. tất cả bài tập được yêu cầu đều thuộc lớp nguồn.

Mảng ID đầu vào được loại bỏ phần tử trùng lặp trước khi xử lý để tránh tạo bản sao lặp ngoài ý muốn.

## Toàn vẹn thao tác và lỗi

Mỗi bản sao gồm hàng bài tập và toàn bộ test case tương ứng. Nếu không thể sao chép test case sau khi đã tạo hàng bài tập, backend phải xóa hàng bài tập chưa hoàn chỉnh hoặc thực hiện thao tác bằng hàm cơ sở dữ liệu có tính nguyên tử. Không để lại bài tập bị thiếu test case.

Kết quả trả về phân biệt rõ:

```json
{
  "copied": 4,
  "failed": 0,
  "targetCount": 2,
  "failures": []
}
```

Lỗi kiểm tra quyền hoặc khác khối làm toàn bộ yêu cầu bị từ chối trước khi bắt đầu sao chép. Lỗi phát sinh trong lúc sao chép được ghi trong `failures`, gồm ID bài nguồn, ID lớp đích và thông báo ngắn.

## Kiểm thử

Kiểm thử backend xác nhận:

- sao chép thành công sang một hoặc nhiều lớp cùng khối của cùng giáo viên;
- từ chối lớp khác khối;
- từ chối lớp của giáo viên khác;
- từ chối lớp nguồn trong danh sách đích;
- từ chối bài tập không thuộc lớp nguồn;
- loại bỏ ID trùng lặp;
- bản sao luôn là nháp và có ID riêng;
- test case được sao chép với ID và `assignment_id` mới;
- không sao chép submissions;
- dọn dẹp bản sao chưa hoàn chỉnh khi sao chép test case thất bại.

Kiểm thử frontend xác nhận danh sách đích chỉ chứa lớp hợp lệ, thông báo đúng khi không có lớp cùng khối và hiển thị chính xác kết quả thành công/thất bại.

## Tiêu chí hoàn thành

- Giáo viên chỉ nhìn thấy và chỉ có thể chọn lớp đích cùng khối do mình quản lý.
- Backend chặn mọi yêu cầu vượt ngoài giới hạn này.
- Bài tập được sao chép dưới dạng nháp và hoạt động độc lập trong từng lớp.
- Không có bản sao bị thiếu test case khi thao tác gặp lỗi.
- Build frontend và toàn bộ kiểm thử tự động liên quan đều thành công.
