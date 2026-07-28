# Visual User Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cập nhật README theo trạng thái production và tạo cẩm nang HTML/PDF trực quan cho giáo viên và học sinh.

**Architecture:** README là tài liệu kỹ thuật và điểm vào duy nhất dẫn đến cẩm nang. Cẩm nang là một file HTML độc lập, dùng CSS/JavaScript nội tuyến, semantic HTML và SVG nội tuyến để mở trực tiếp trong trình duyệt mà không cần build.

**Tech Stack:** Markdown, HTML5, CSS3, JavaScript thuần, Node.js test runner.

## Global Constraints

- Nội dung bằng tiếng Việt, dễ hiểu với người không rành kỹ thuật.
- Bao gồm đầy đủ luồng giáo viên và học sinh.
- Dùng `Be Vietnam Pro` với font dự phòng hệ thống.
- Responsive, hỗ trợ bàn phím và `prefers-reduced-motion`.
- Không dùng ảnh ngoài; icon và minh họa dùng SVG/CSS nội tuyến.
- Không ghi giá trị production của `TEACHER_SECRET`, JWT hoặc khóa Supabase.
- README phải khớp URL production, migration `001`–`008` và API hiện tại.
- PDF cuối cùng đặt tại `output/pdf/cam-nang-su-dung-lms-thpt.pdf`.

---

### Task 1: Kiểm thử hợp đồng tài liệu

**Files:**
- Create: `test/documentation.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `README.md`, `docs/huong-dan-su-dung.html`.
- Produces: script `npm run test:docs`.

- [ ] **Step 1: Viết kiểm thử thất bại**

Tạo test đọc hai file và xác nhận:

```js
test('README documents production and links the visual guide', async () => {
  assert.match(readme, /https:\/\/frontend-alpha-henna-71\.vercel\.app/);
  assert.match(readme, /docs\/huong-dan-su-dung\.html/);
  assert.match(readme, /008_delete_class_transaction\.sql/);
  assert.doesNotMatch(readme, /TEACHER_SECRET=[a-f0-9]{32,}/);
});

test('visual guide covers teacher and student journeys accessibly', async () => {
  for (const id of ['giao-vien', 'hoc-sinh', 'xu-ly-loi']) {
    assert.match(guide, new RegExp(`id=\"${id}\"`));
  }
  assert.match(guide, /Be Vietnam Pro/);
  assert.match(guide, /prefers-reduced-motion/);
  assert.match(guide, /skip-link/);
  assert.doesNotMatch(guide, /<img[^>]+src=\"https?:/);
  assert.doesNotMatch(guide, /9ca01d06abd4b2ec/);
});

test('README links the shareable PDF guide', async () => {
  assert.match(readme, /output\/pdf\/cam-nang-su-dung-lms-thpt\.pdf/);
});
```

Thêm script:

```json
"test:docs": "node --test test/documentation.test.js"
```

- [ ] **Step 2: Xác nhận RED**

Run: `npm.cmd run test:docs`

Expected: FAIL vì `docs/huong-dan-su-dung.html` chưa tồn tại và README chưa có nội dung mới.

- [ ] **Step 3: Commit test**

```powershell
git add test/documentation.test.js package.json
git commit -m "test: define documentation contract"
```

---

### Task 2: Cập nhật README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: cấu trúc repo, `render.yaml`, routes backend và URL production.
- Produces: README kỹ thuật hiện hành, liên kết `docs/huong-dan-su-dung.html`.

- [ ] **Step 1: Viết lại README**

README phải có:

```markdown
# LMS THPT Cà Mau

[Mở hệ thống](https://frontend-alpha-henna-71.vercel.app) ·
[Xem cẩm nang trực quan](docs/huong-dan-su-dung.html)
```

Các mục bắt buộc: Tổng quan, Tính năng giáo viên, Tính năng học sinh, Kiến trúc, Chạy local, Biến môi trường, Database migrations `001`–`008`, Kiểm thử, Deploy Render/Vercel, API chính, Bảo mật và Xử lý lỗi. Chỉ ghi `TEACHER_SECRET=<mã-do-quản-trị-viên-tạo>`.

- [ ] **Step 2: Chạy test và kiểm tra liên kết**

Run: `npm.cmd run test:docs`

Expected: vẫn FAIL duy nhất do cẩm nang chưa tồn tại; các assertion README PASS.

- [ ] **Step 3: Commit README**

```powershell
git add README.md
git commit -m "docs: refresh production README"
```

---

### Task 3: Tạo cẩm nang HTML trực quan

**Files:**
- Create: `docs/huong-dan-su-dung.html`

**Interfaces:**
- Consumes: hành trình người dùng trong đặc tả.
- Produces: cẩm nang HTML độc lập với section IDs `tong-quan`, `giao-vien`, `hoc-sinh`, `xu-ly-loi`.

- [ ] **Step 1: Tạo cấu trúc semantic**

Tạo `header`, `nav`, `main`, `section`, `footer`; thêm skip link, mục lục, hero và hai lộ trình. Mỗi bước dùng một `article.step-card` với số thứ tự, thao tác, kết quả mong đợi và mẹo.

- [ ] **Step 2: Thêm hệ thống hình ảnh**

CSS phải định nghĩa token màu, typography, lưới responsive, card, mock window và trạng thái:

```css
:root {
  --font: "Be Vietnam Pro", Inter, ui-sans-serif, system-ui, sans-serif;
  --teacher: #2563eb;
  --student: #7c3aed;
  --danger: #dc2626;
}
```

Tải font bằng `@import` nhưng giữ đầy đủ font dự phòng. Không dùng ảnh ngoài; minh họa dùng CSS và SVG nội tuyến có `aria-hidden="true"`.

- [ ] **Step 3: Thêm tương tác nhẹ**

JavaScript nội tuyến:

- cập nhật progress bar theo vị trí cuộn;
- tô sáng mục lục bằng `IntersectionObserver`;
- chuyển nhanh vai trò;
- không chặn nội dung khi JavaScript tắt.

- [ ] **Step 4: Hoàn thiện nội dung**

Bao gồm tám bước giáo viên, năm bước học sinh, bảng “Bạn đang ở đâu?”, xử lý bốn lỗi thường gặp, cảnh báo xóa lớp, hướng dẫn `Ctrl + F5`, và liên kết mở production.

- [ ] **Step 5: Xác nhận GREEN**

Run: `npm.cmd run test:docs`

Expected: tất cả test PASS.

Run: `npm.cmd test --prefix backend`

Expected: backend tests PASS.

Run: `npm.cmd test --prefix frontend`

Expected: frontend tests PASS.

- [ ] **Step 6: Kiểm tra trực quan**

Mở file bằng trình duyệt tại desktop và mobile; xác nhận không tràn ngang, mục lục dùng được, focus hiển thị và reduced motion hoạt động.

- [ ] **Step 7: Commit**

```powershell
git add docs/huong-dan-su-dung.html
git commit -m "docs: add visual teacher and student guide"
```

---

### Task 4: Review và xuất bản

**Files:**
- Create: `scripts/export-user-guide-pdf.mjs`
- Create: `output/pdf/cam-nang-su-dung-lms-thpt.pdf`
- Modify only if verification reveals a defect.

**Interfaces:**
- Consumes: các tài liệu và test đã hoàn thành.
- Produces: PDF A4 đã kiểm tra, PR đã merge và tài liệu có thể mở từ GitHub.

- [ ] **Step 1: Xuất PDF**

Tạo script dùng Chromium/Playwright mở `docs/huong-dan-su-dung.html`, chờ font sẵn sàng và gọi `page.pdf` với:

```js
await page.pdf({
  path: outputPath,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="font-size:9px;width:100%;text-align:center;color:#64748b"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  margin: { top: '12mm', right: '12mm', bottom: '16mm', left: '12mm' },
});
```

HTML phải có `@media print`, `@page { size: A4; }`, tránh ngắt card giữa trang và ẩn tương tác chỉ dành cho màn hình.

- [ ] **Step 2: Kiểm tra PDF**

Dùng `pdfinfo` xác nhận khổ A4 và số trang. Dùng `pdftotext` hoặc `pdfplumber` xác nhận có các chuỗi `Dành cho giáo viên`, `Dành cho học sinh`, `Xóa lớp an toàn`. Render toàn bộ trang bằng `pdftoppm -png`, kiểm tra trực quan không có chữ cắt, chồng lấn, trang trắng hoặc ký tự lỗi.

- [ ] **Step 3: Xác minh cuối**

Run:

```powershell
npm.cmd run test:docs
npm.cmd test --prefix backend
npm.cmd test --prefix frontend
npm.cmd run build --prefix frontend
git diff --check
git status --short
```

Expected: test/build exit 0, không có lỗi whitespace và worktree chỉ có thay đổi dự kiến.

- [ ] **Step 4: Push và PR**

```powershell
git push -u origin codex/visual-user-guide
gh pr create --base main --head codex/visual-user-guide --title "Cập nhật README và cẩm nang sử dụng trực quan"
```

- [ ] **Step 5: Merge và xác nhận**

Merge PR sau review. Mở README và `docs/huong-dan-su-dung.html` từ GitHub, xác nhận liên kết production và mục lục hoạt động.
