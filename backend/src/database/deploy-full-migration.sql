-- ============================================================
-- Trợ lý Nghiên cứu Python — FULL MIGRATION
-- Chạy một lần trong Supabase SQL Editor (production)
-- ============================================================
-- Gồm: 012_python_assistant.sql + 013_seed_learning_path.sql
-- ============================================================

-- ================== TÀI LIỆU & RAG ==================

create table if not exists tai_lieu (
  id uuid primary key default gen_random_uuid(),
  file_path text not null,
  ten_file text not null,
  chuyen_de text not null,
  nhanh text not null check (nhanh in ('dai-tra','hsg')),
  loai text not null check (loai in ('ly-thuyet','bai-tap','de-thi')),
  muc_do text check (muc_do in ('CB','TB','NC','HSG')),
  noi_dung text not null,
  thu_tu_chunk int not null,
  embedding vector(1536),
  trang_thai text default 'cho_xu_ly' check (trang_thai in ('cho_xu_ly','da_xu_ly','loi')),
  created_at timestamptz default now()
);
create index if not exists idx_tai_lieu_embedding on tai_lieu using ivfflat (embedding vector_cosine_ops);
create index if not exists idx_tai_lieu_nhanh on tai_lieu (nhanh, muc_do, chuyen_de);

create table if not exists tai_lieu_hinh_anh (
  id uuid primary key default gen_random_uuid(),
  tai_lieu_id uuid references tai_lieu(id) on delete cascade,
  file_path text not null,
  mo_ta text,
  embedding vector(1536),
  trang_thai text default 'cho_xu_ly' check (trang_thai in ('cho_xu_ly','da_xu_ly','loi')),
  created_at timestamptz default now()
);
create index if not exists idx_tai_lieu_hinh_anh_tai_lieu on tai_lieu_hinh_anh(tai_lieu_id);

-- ================== HÀNG ĐỢI XỬ LÝ ==================

create table if not exists queue_embedding (
  id uuid primary key default gen_random_uuid(),
  tai_lieu_id uuid references tai_lieu(id) on delete cascade,
  trang_thai text default 'cho_xu_ly' check (trang_thai in ('cho_xu_ly','dang_xu_ly','xong','loi')),
  so_lan_thu int default 0,
  loi text,
  created_at timestamptz default now()
);

create table if not exists queue_vision_caption (
  id uuid primary key default gen_random_uuid(),
  hinh_anh_id uuid references tai_lieu_hinh_anh(id) on delete cascade,
  trang_thai text default 'cho_xu_ly' check (trang_thai in ('cho_xu_ly','dang_xu_ly','xong','loi')),
  so_lan_thu int default 0,
  loi text,
  created_at timestamptz default now()
);

-- ================== LỘ TRÌNH HỌC ==================

create table if not exists lo_trinh_chu_de (
  id uuid primary key default gen_random_uuid(),
  nhanh text not null check (nhanh in ('dai-tra','hsg')),
  ma_bai text,
  ten_chu_de text not null,
  thu_tu int not null,
  mo_ta_ngan text,
  chu_de_tien_quyet uuid references lo_trinh_chu_de(id),
  visualizer_route text,
  created_at timestamptz default now()
);

create table if not exists tien_do_hoc_sinh (
  id uuid primary key default gen_random_uuid(),
  hoc_sinh_id uuid references auth.users(id) on delete cascade,
  chu_de_id uuid references lo_trinh_chu_de(id) on delete cascade,
  trang_thai text default 'chua_hoc' check (trang_thai in ('chua_hoc','dang_hoc','da_xong')),
  cap_nhat_luc timestamptz default now(),
  unique(hoc_sinh_id, chu_de_id)
);

-- ================== BÀI TẬP & ĐỀ THI ==================

create table if not exists bai_tap_sinh (
  id uuid primary key default gen_random_uuid(),
  chu_de_id uuid references lo_trinh_chu_de(id),
  muc_do text check (muc_do in ('CB','TB','NC','HSG')),
  noi_dung jsonb not null,
  nguon_tham_khao uuid references tai_lieu(id),
  duyet_boi uuid references auth.users(id),
  trang_thai text default 'cho_duyet' check (trang_thai in ('cho_duyet','da_duyet','tu_choi')),
  created_at timestamptz default now()
);

create table if not exists de_thi (
  id uuid primary key default gen_random_uuid(),
  ten_de text not null,
  nhanh text not null check (nhanh in ('dai-tra','hsg')),
  muc_do text,
  nam_hoc text,
  danh_sach_bai_tap uuid[],
  thoi_gian_lam_bai_phut int,
  duyet_boi uuid references auth.users(id),
  trang_thai text default 'cho_duyet' check (trang_thai in ('cho_duyet','da_duyet','tu_choi')),
  created_at timestamptz default now()
);

-- ================== RPC: match_tai_lieu ==================

create or replace function match_tai_lieu(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_nhanh text default null
)
returns table(
  id uuid,
  noi_dung text,
  chuyen_de text,
  nhanh text,
  loai text,
  muc_do text,
  ten_file text,
  thu_tu_chunk int,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    tai_lieu.id,
    tai_lieu.noi_dung,
    tai_lieu.chuyen_de,
    tai_lieu.nhanh,
    tai_lieu.loai,
    tai_lieu.muc_do,
    tai_lieu.ten_file,
    tai_lieu.thu_tu_chunk,
    1 - (tai_lieu.embedding <=> query_embedding) as similarity
  from tai_lieu
  where tai_lieu.trang_thai = 'da_xu_ly'
    and tai_lieu.embedding is not null
    and 1 - (tai_lieu.embedding <=> query_embedding) > match_threshold
    and (filter_nhanh is null or tai_lieu.nhanh = filter_nhanh)
  order by tai_lieu.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ================== RLS (service_role only) ==================

alter table tai_lieu enable row level security;
alter table tai_lieu_hinh_anh enable row level security;
alter table queue_embedding enable row level security;
alter table queue_vision_caption enable row level security;
alter table lo_trinh_chu_de enable row level security;
alter table tien_do_hoc_sinh enable row level security;
alter table bai_tap_sinh enable row level security;
alter table de_thi enable row level security;

revoke all on tai_lieu, tai_lieu_hinh_anh, queue_embedding, queue_vision_caption, lo_trinh_chu_de, tien_do_hoc_sinh, bai_tap_sinh, de_thi from anon, authenticated;
grant select, insert, update, delete on tai_lieu, tai_lieu_hinh_anh, queue_embedding, queue_vision_caption, lo_trinh_chu_de, tien_do_hoc_sinh, bai_tap_sinh, de_thi to service_role;

-- ================== SEED LỘ TRÌNH HỌC ==================

-- Nhánh đại trà — 17 bài SGK Kết Nối Tri Thức (Bài 16-32)
insert into lo_trinh_chu_de (nhanh, ma_bai, ten_chu_de, thu_tu, mo_ta_ngan, chu_de_tien_quyet, visualizer_route)
select 'dai-tra', seed.ma_bai, seed.ten_chu_de, seed.thu_tu, seed.mo_ta_ngan,
  case when seed.thu_tu > 1 then (select id from lo_trinh_chu_de where nhanh = 'dai-tra' and thu_tu = seed.thu_tu - 1) else null end,
  seed.visualizer_route
from (values
  (1,  'bai-16',  'Bài 16: Ngôn ngữ lập trình Python',                'Làm quen với Python, môi trường lập trình.', null),
  (2,  'bai-17',  'Bài 17: Biến và lệnh gán',                          'Khai báo biến, kiểu dữ liệu, phép gán.', null),
  (3,  'bai-18',  'Bài 18: Lệnh nhập và xuất dữ liệu',                'input(), print(), định dạng.', null),
  (4,  'bai-19',  'Bài 19: Câu lệnh rẽ nhánh if',                      'if, if-else, if-elif-else.', null),
  (5,  'bai-20',  'Bài 20: Câu lệnh lặp for',                          'Vòng lặp for, range().', '/visualizer/vong-lap-for'),
  (6,  'bai-21',  'Bài 21: Câu lệnh lặp while',                        'Vòng lặp while, break, continue.', '/visualizer/vong-lap-while'),
  (7,  'bai-22',  'Bài 22: Kiểu dữ liệu danh sách list',               'Tạo list, chỉ mục, cắt, thêm/xóa.', null),
  (8,  'bai-23',  'Bài 23: Một số lệnh làm việc với list',             'sort(), reverse(), len(), list comprehension.', null),
  (9,  'bai-24',  'Bài 24: Xâu ký tự string',                          'Tạo xâu, chỉ mục, cắt xâu.', null),
  (10, 'bai-25',  'Bài 25: Một số lệnh làm việc với xâu',              'split(), join(), replace(), find().', null),
  (11, 'bai-26',  'Bài 26: Hàm trong Python (phần 1)',                 'Định nghĩa hàm, tham số, giá trị trả về.', null),
  (12, 'bai-27',  'Bài 27: Hàm trong Python (phần 2)',                 'Tham số mặc định, phạm vi biến.', null),
  (13, 'bai-28',  'Bài 28: Thiết lập môi trường lập trình',            'Cài đặt Python, IDE.', null),
  (14, 'bai-29',  'Bài 29: Thư viện và module trong Python',           'import, from...import, tạo module.', null),
  (15, 'bai-30',  'Bài 30: Đọc và ghi dữ liệu từ tệp',                 'open(), đọc ghi file, with statement.', null),
  (16, 'bai-31',  'Bài 31: Thực hành tổng hợp (phần 1)',               'Ôn tập: xử lý số, chuỗi, danh sách.', null),
  (17, 'bai-32',  'Bài 32: Thực hành tổng hợp (phần 2)',               'Ôn tập: hàm, file, chương trình hoàn chỉnh.', null)
) as seed(thu_tu, ma_bai, ten_chu_de, mo_ta_ngan, visualizer_route)
where not exists (select 1 from lo_trinh_chu_de where nhanh = 'dai-tra' and ma_bai = seed.ma_bai);

-- Nhánh HSG — Nhóm A (Python nâng cao, 6 mục)
insert into lo_trinh_chu_de (nhanh, ma_bai, ten_chu_de, thu_tu, mo_ta_ngan, visualizer_route)
select 'hsg', seed.ma_bai, seed.ten_chu_de, seed.thu_tu, seed.mo_ta_ngan, seed.visualizer_route
from (values
  (1,  'hsg-bit',    'Phép tính xử lý bit',                'AND, OR, XOR, NOT, shift.', null),
  (2,  'hsg-file',   'File văn bản trong Python',          'Đọc/ghi file, đọc theo dòng.', null),
  (3,  'hsg-lambda', 'Lập trình hàm',                      'lambda, map(), filter().', null),
  (4,  'hsg-module', 'Tổ chức thư viện và module',         'Tạo module, package.', null),
  (5,  'hsg-tuple-dict', 'Tuple và Dict (từ điển)',        'Tuple, dict, CRUD, duyệt key/value.', null),
  (6,  'hsg-struct', 'CTDL nâng cao',                      'Stack, queue, deque, set.', '/visualizer/stack-queue')
) as seed(thu_tu, ma_bai, ten_chu_de, mo_ta_ngan, visualizer_route)
where not exists (select 1 from lo_trinh_chu_de where nhanh = 'hsg' and ma_bai = seed.ma_bai);

-- Nhánh HSG — Nhóm B (Thuật toán chuyên sâu, 8 mục) — có tiên quyết
insert into lo_trinh_chu_de (nhanh, ma_bai, ten_chu_de, thu_tu, mo_ta_ngan, chu_de_tien_quyet, visualizer_route)
select 'hsg', seed.ma_bai, seed.ten_chu_de, seed.thu_tu + 6, seed.mo_ta_ngan,
  case when seed.thu_tu > 1 then (select id from lo_trinh_chu_de where nhanh = 'hsg' and ma_bai = (
    select seed2.mb from (values
      (1,'hsg-algo'),(2,'hsg-recursive'),(3,'hsg-ds'),(4,'hsg-graph'),
      (5,'hsg-dp'),(6,'hsg-math'),(7,'hsg-string'),(8,'hsg-contest')
    ) as seed2(t, mb) where seed2.t = seed.thu_tu - 1
  )) else null end,
  seed.visualizer_route
from (values
  (1, 'hsg-algo',      'Nền tảng thuật toán',                    'Độ phức tạp, Big-O, chia để trị.',                                          '/visualizer/big-o'),
  (2, 'hsg-recursive', 'Đệ quy và Quay lui',                    'Backtracking, N-Queens, nhánh cận.',                                        '/visualizer/n-queens'),
  (3, 'hsg-ds',        'CTDL nâng cao (heap, cây, DSU)',        'Heap, cây nhị phân, DSU, Segment Tree.',                                    '/visualizer/segment-tree'),
  (4, 'hsg-graph',     'Đồ thị',                                'BFS, DFS, Dijkstra, Floyd, cây khung.',                                     '/visualizer/graph-bfs-dfs'),
  (5, 'hsg-dp',        'Quy hoạch động',                        'DP dãy, ba lô, DP đồ thị, Digit DP.',                                       '/visualizer/dp-knapsack'),
  (6, 'hsg-math',      'Toán tổ hợp và số học',                 'Số nguyên tố, GCD/LCM, modulo, tổ hợp.',                                     null),
  (7, 'hsg-string',    'Xử lý chuỗi nâng cao',                  'KMP, Z-algorithm, hash, Manacher.',                                         null),
  (8, 'hsg-contest',   'Kỹ năng thi đấu',                      'Đọc đề, tối ưu I/O, debug, chiến thuật.',                                    null)
) as seed(thu_tu, ma_bai, ten_chu_de, mo_ta_ngan, visualizer_route)
where not exists (select 1 from lo_trinh_chu_de where nhanh = 'hsg' and ma_bai = seed.ma_bai);
