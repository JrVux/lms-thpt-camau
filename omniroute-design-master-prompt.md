# OmniRoute Dashboard — Design Language & Master Prompt

## Phân tích ngôn ngữ thiết kế

Kiểu **SaaS Admin Dashboard hiện đại**, phong cách gần với Vercel / Linear / shadcn-ui dashboard.

### 1. Bố cục (Layout)
- **Sidebar cố định bên trái** (~280px), nền trắng/xám rất nhạt, có logo + version ở trên cùng
- **Header trên cùng**: breadcrumb + tiêu đề trang (kèm mô tả phụ nhỏ màu xám), thanh search command (Ctrl+K), chọn ngôn ngữ, toggle dark mode, nút logout
- **Nội dung chính**: nền xám rất nhạt (gần trắng), các card nổi trên nền bằng shadow nhẹ + bo góc lớn

### 2. Màu sắc (Color Palette)
- **Accent chính**: đỏ-hồng san hô (coral red, `#E8544A`) dùng cho logo, icon chính, link nhấn mạnh
- **Icon badge nhiều màu**: mỗi icon có nền hình vuông bo góc, màu pastel nhạt (đỏ, xanh lá, tím, cam, xanh dương nhạt)
- **Nền tổng thể**: trắng (`#FFFFFF`) cho card, xám rất nhạt (`#FAFAFA`) cho nền trang
- **Text**: đen/xám đậm cho tiêu đề, xám trung bình cho mô tả phụ
- **Link nhấn mạnh trong đoạn văn**: màu đỏ/cam giống accent chính

### 3. Typography
- Font sans-serif hiện đại (Inter / SF Pro), tiêu đề đậm (semibold/bold), mô tả phụ nhỏ hơn và nhạt màu hơn

### 4. Component style
- **Card**: bo góc lớn (rounded-2xl, ~16-20px), border rất mảnh hoặc không có, shadow rất nhẹ
- **Icon container**: hình vuông bo góc (rounded-xl), ~40-48px, nền pastel + icon outline màu đậm tương ứng
- **Button chính**: nền xanh dương đậm/đỏ, bo góc rounded-lg, có icon
- **Banner quảng cáo**: nền gradient nhạt (xanh dương nhạt), nút CTA nổi bật + nút đóng (x)
- **Sidebar item active**: nền đỏ nhạt (pastel), text + icon màu đỏ đậm, bo góc

---

## 🎯 MASTER PROMPT — Tái tạo giao diện OmniRoute Dashboard

```
Bạn là một Frontend Engineer chuyên về thiết kế SaaS Dashboard hiện đại.
Hãy xây dựng một React + TailwindCSS single-page dashboard UI theo đúng
design system sau (phong cách "OmniRoute" — SaaS Admin Dashboard tối giản,
sáng, dùng icon-badge màu pastel).

## 1. DESIGN TOKENS

### Màu sắc
- --bg-page: #FAFAFA (nền trang, xám rất nhạt)
- --bg-card: #FFFFFF (nền card)
- --accent-primary: #E8544A (đỏ san hô - logo, active state, link)
- --accent-primary-light: #FDEDEC (nền pastel cho accent đỏ)
- --text-heading: #18181B (đen xám đậm)
- --text-body: #52525B (xám trung)
- --text-muted: #A1A1AA (xám nhạt, mô tả phụ)
- --border-subtle: #ECECEE (viền rất mảnh)
- --badge colors (nền pastel 10-15% opacity + icon màu đậm tương ứng):
  - đỏ: bg #FDEDEC / icon #E8544A
  - xanh lá: bg #E7F6EC / icon #22A55A
  - tím: bg #F0EDFB / icon #7C5CFC
  - cam: bg #FFF3E0 / icon #F5A623
  - xanh dương: bg #E8F0FE / icon #3B82F6

### Typography
- Font: Inter / SF Pro / -apple-system
- H1 (tiêu đề trang): 24px, font-semibold, text-heading
- Subtitle: 14px, font-normal, text-muted
- Card title: 15-16px, font-semibold
- Card description: 13-14px, text-muted, line-height thoáng

### Bo góc & Shadow
- Card lớn: rounded-2xl (20px), shadow-sm (rất nhẹ, gần như border)
- Icon badge: rounded-xl (12px), kích thước 40x40px hoặc 44x44px
- Button: rounded-lg (10px)
- Sidebar item active: rounded-lg, nền pastel đỏ

## 2. BỐ CỤC TỔNG THỂ

### Sidebar trái (280px, nền trắng, border-right mảnh)
- Logo (icon vuông màu đỏ, bo góc) + tên app + version, đặt trên cùng
- Ô search "Tìm kiếm" dạng input bo tròn, icon kính lúp
- Nhóm menu có label section (uppercase, xám, letter-spacing rộng)
- Menu item: icon bên trái + tên chính (đậm) + mô tả phụ (nhỏ, xám) bên dưới
- Item đang active: nền đỏ nhạt, icon+text màu đỏ đậm, có thanh chỉ báo bên trái (2-4px, màu đỏ)
- Cuối sidebar: trạng thái nhỏ kiểu "Đã tắt đồng bộ" với icon

### Header trên cùng (sticky, nền trắng, border-bottom mảnh)
- Bên trái: icon trang + Tiêu đề (H1) + mô tả phụ dưới tiêu đề
- Bên phải:
  - Search bar command palette (placeholder "Điều hướng nhanh" + badge phím tắt "Ctrl+K")
  - Dropdown chọn ngôn ngữ (cờ + mã ngôn ngữ + chevron)
  - Toggle dark/light mode (icon mặt trăng/mặt trời)
  - Icon logout

### Nội dung chính (padding 32px, nền --bg-page)
1. **Banner quảng cáo/thông báo** (full-width, nền gradient xanh dương nhạt,
   rounded-2xl, padding 20px): icon logo đối tác bên trái + tiêu đề đậm +
   mô tả xám + nút CTA màu xanh dương đậm bên phải + nút đóng (x) góc phải

2. **Card "Bắt đầu nhanh"** (white card, rounded-2xl, padding 32px):
   - Header: Tiêu đề H2 + mô tả, nút "Tài liệu đầy đủ" (outline button, icon sách) ở góc phải
   - Grid 2x2 gồm 4 "step card": mỗi step có:
     - Icon badge màu pastel riêng (vuông, bo góc, 44px)
     - Tiêu đề đậm kèm số thứ tự ("1. Tạo khóa API")
     - Mô tả 2 dòng, có 1-2 từ khóa được highlight màu đỏ/link
     - Card con này KHÔNG có border/shadow riêng, chỉ cách nhau bằng gap,
       hover có thể đổi nền nhẹ

## 3. YÊU CẦU KỸ THUẬT
- Dùng React function component, TailwindCSS (chỉ dùng utility class core)
- Responsive: sidebar có thể collapse thành icon-only trên màn nhỏ
- Dark mode: chuẩn bị sẵn class dark: cho toàn bộ token màu
- Icon: dùng lucide-react (Search, Home, Key, Server, Box, Link2, BarChart3,
  Moon, LogOut, ChevronDown, BookOpen, X, ChevronLeft...)
- Không dùng ảnh, tất cả icon là SVG/component
- Toàn bộ text mẫu bằng tiếng Việt như thiết kế gốc

## 4. TONE & CẢM GIÁC TỔNG THỂ
Sạch sẽ, thoáng, chuyên nghiệp kiểu "developer tool" (giống Vercel/Linear/
Stripe Dashboard) nhưng thân thiện hơn nhờ icon-badge nhiều màu pastel.
Nhiều khoảng trắng (whitespace), không dùng màu quá gắt, shadow cực nhẹ
tạo chiều sâu tối thiểu.

Hãy tạo component Dashboard hoàn chỉnh với đầy đủ sidebar, header, banner,
và card "Bắt đầu nhanh" 4 bước như mô tả trên.
```
