-- Seed: Nhánh đại trà — 17 bài SGK Kết Nối Tri Thức (Bài 16–32, Chủ đề 5)
-- Mỗi bài trỏ chu_de_tien_quyet về bài liền trước (trừ bài đầu)

INSERT INTO lo_trinh_chu_de (nhanh, ma_bai, ten_chu_de, thu_tu, mo_ta_ngan, chu_de_tien_quyet, visualizer_route)
SELECT 'dai-tra', seed.ma_bai, seed.ten_chu_de, seed.thu_tu, seed.mo_ta_ngan,
  CASE WHEN seed.thu_tu > 1 THEN (SELECT id FROM lo_trinh_chu_de WHERE nhanh = 'dai-tra' AND thu_tu = seed.thu_tu - 1) ELSE NULL END,
  seed.visualizer_route
FROM (VALUES
  (1,  'bai-16',  'Bài 16: Ngôn ngữ lập trình Python',                'Làm quen với Python, môi trường lập trình, chạy chương trình đầu tiên.', NULL),
  (2,  'bai-17',  'Bài 17: Biến và lệnh gán',                          'Khai báo biến, kiểu dữ liệu cơ bản, phép gán, biểu thức số học.', NULL),
  (3,  'bai-18',  'Bài 18: Lệnh nhập và xuất dữ liệu',                'input(), print(), định dạng xuất dữ liệu.', NULL),
  (4,  'bai-19',  'Bài 19: Câu lệnh rẽ nhánh if',                      'if, if-else, if-elif-else, điều kiện boolean.', NULL),
  (5,  'bai-20',  'Bài 20: Câu lệnh lặp for',                          'Vòng lặp for, range(), duyệt dan sách.', '/visualizer/vong-lap-for'),
  (6,  'bai-21',  'Bài 21: Câu lệnh lặp while',                        'Vòng lặp while, vòng lặp vô hạn, break, continue.', '/visualizer/vong-lap-while'),
  (7,  'bai-22',  'Bài 22: Kiểu dữ liệu danh sách list',               'Tạo list, chỉ mục, cắt, thêm/xóa phần tử, duyệt list.', NULL),
  (8,  'bai-23',  'Bài 23: Một số lệnh làm việc với list',             'sort(), reverse(), len(), min(), max(), sum(), list comprehension.', NULL),
  (9,  'bai-24',  'Bài 24: Xâu ký tự string',                          'Tạo xâu, chỉ mục, cắt xâu, duyệt xâu, các phương thức xử lý xâu.', NULL),
  (10, 'bai-25',  'Bài 25: Một số lệnh làm việc với xâu',              'split(), join(), replace(), find(), in, các hàm xử lý xâu nâng cao.', NULL),
  (11, 'bai-26',  'Bài 26: Hàm trong Python (phần 1)',                 'Định nghĩa hàm, tham số, giá trị trả về, gọi hàm.', NULL),
  (12, 'bai-27',  'Bài 27: Hàm trong Python (phần 2)',                 'Tham số mặc định, tham số tùy chọn, phạm vi biến (local/global).', NULL),
  (13, 'bai-28',  'Bài 28: Thiết lập môi trường lập trình',            'Cài đặt Python, IDE, chạy script từ dòng lệnh.', NULL),
  (14, 'bai-29',  'Bài 29: Thư viện và module trong Python',           'import, from...import, thư viện chuẩn, tạo module riêng.', NULL),
  (15, 'bai-30',  'Bài 30: Đọc và ghi dữ liệu từ tệp',                 'open(), đọc file text, ghi file, with statement, xử lý lỗi file.', NULL),
  (16, 'bai-31',  'Bài 31: Thực hành tổng hợp (phần 1)',               'Ôn tập và vận dụng: xử lý số, chuỗi, danh sách.', NULL),
  (17, 'bai-32',  'Bài 32: Thực hành tổng hợp (phần 2)',               'Ôn tập và vận dụng: hàm, file, chương trình hoàn chỉnh.', NULL)
) AS seed(thu_tu, ma_bai, ten_chu_de, mo_ta_ngan, visualizer_route)
WHERE NOT EXISTS (SELECT 1 FROM lo_trinh_chu_de WHERE nhanh = 'dai-tra' AND ma_bai = seed.ma_bai);

-- Seed: Nhánh HSG — Nhóm A (Python nâng cao, 6 mục)
-- Không có tiên quyết tuyến tính như đại trà

INSERT INTO lo_trinh_chu_de (nhanh, ma_bai, ten_chu_de, thu_tu, mo_ta_ngan, visualizer_route)
SELECT 'hsg', seed.ma_bai, seed.ten_chu_de, seed.thu_tu, seed.mo_ta_ngan, seed.visualizer_route
FROM (VALUES
  (1,  'hsg-bit',    'Phép tính xử lý bit',                'AND, OR, XOR, NOT, shift — ứng dụng trong lập trình.', NULL),
  (2,  'hsg-file',   'File văn bản trong Python',          'Mở/đóng/đọc/ghi file, đọc theo dòng, đọc không biết trước số dòng.', NULL),
  (3,  'hsg-lambda', 'Lập trình hàm',                      'lambda, map(), filter(), reduce(), hàm bậc cao.', NULL),
  (4,  'hsg-module', 'Tổ chức thư viện và module',         'Tạo module, package, kết gắn với chương trình chính.', NULL),
  (5,  'hsg-tuple-dict', 'Tuple và Dict (từ điển)',        'Tuple bất biến, dict, khởi tạo, CRUD, duyệt key/value.', NULL),
  (6,  'hsg-struct', 'CTDL nâng cao',                      'Stack, queue, deque, priority queue, set — lý thuyết + cài đặt.', '/visualizer/stack-queue')
) AS seed(thu_tu, ma_bai, ten_chu_de, mo_ta_ngan, visualizer_route)
WHERE NOT EXISTS (SELECT 1 FROM lo_trinh_chu_de WHERE nhanh = 'hsg' AND ma_bai = seed.ma_bai);

-- Seed: Nhánh HSG — Nhóm B (Thuật toán chuyên sâu, 8 mục)
-- Tiên quyết tuyến tính trong nội bộ nhóm B

INSERT INTO lo_trinh_chu_de (nhanh, ma_bai, ten_chu_de, thu_tu, mo_ta_ngan, chu_de_tien_quyet, visualizer_route)
SELECT 'hsg', seed.ma_bai, seed.ten_chu_de, seed.thu_tu + 6, seed.mo_ta_ngan,
  CASE WHEN seed.thu_tu > 1 THEN (SELECT id FROM lo_trinh_chu_de WHERE nhanh = 'hsg' AND ma_bai = (
    SELECT seed2.mb FROM (VALUES
      (1,'hsg-algo'),(2,'hsg-recursive'),(3,'hsg-ds'),(4,'hsg-graph'),
      (5,'hsg-dp'),(6,'hsg-math'),(7,'hsg-string'),(8,'hsg-contest')
    ) AS seed2(t, mb) WHERE seed2.t = seed.thu_tu - 1
  )) ELSE NULL END,
  seed.visualizer_route
FROM (VALUES
  (1, 'hsg-algo',      'Nền tảng thuật toán',                    'Độ phức tạp, Big-O, đệ quy cơ bản, chia để trị.',                                            '/visualizer/big-o'),
  (2, 'hsg-recursive', 'Đệ quy và Quay lui',                    'Đệ quy nâng cao, backtracking, nhánh cận, bài toán N-Queens, tổ hợp.',                       '/visualizer/n-queens'),
  (3, 'hsg-ds',        'CTDL nâng cao (heap, cây, DSU)',        'Heap, cây nhị phân, Disjoint Set Union, Segment Tree, Trie.',                                '/visualizer/segment-tree'),
  (4, 'hsg-graph',     'Đồ thị',                                'BFS, DFS, Dijkstra, Floyd-Warshall, Bellman-Ford, cây khung nhỏ nhất.',                       '/visualizer/graph-bfs-dfs'),
  (5, 'hsg-dp',        'Quy hoạch động',                        'DP cơ bản, DP trên dãy, DP ba lô, DP trên đồ thị DAG, Digit DP.',                            '/visualizer/dp-knapsack'),
  (6, 'hsg-math',      'Toán tổ hợp và số học',                 'Số nguyên tố, GCD/LCM, modulo, tổ hợp, chỉnh hợp, nguyên lý bù trừ.',                         NULL),
  (7, 'hsg-string',    'Xử lý chuỗi nâng cao',                  'KMP, Z-algorithm, hash, Manacher, suffix array — tìm kiếm và xử lý xâu.',                     NULL),
  (8, 'hsg-contest',   'Kỹ năng thi đấu',                      'Đọc đề, tối ưu I/O, debug nhanh, chiến thuật làm bài, quản lý thời gian.',                    NULL)
) AS seed(thu_tu, ma_bai, ten_chu_de, mo_ta_ngan, visualizer_route)
WHERE NOT EXISTS (SELECT 1 FROM lo_trinh_chu_de WHERE nhanh = 'hsg' AND ma_bai = seed.ma_bai);