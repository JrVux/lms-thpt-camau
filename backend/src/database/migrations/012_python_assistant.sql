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