# Kế hoạch xây dựng Landing PlanGo — bản chờ owner duyệt

- Mã kế hoạch: `PLANGO-LP-01` · Phiên bản: r4 (19/10/2026: phí theo tháng 3/5/9 triệu; ảnh 2x; kênh lead Sheet riêng PlanGo) · r3 (video chuyển cho session hungnhan-garment; G3+G5 hoàn thành) · trước đó r2 · Ngày: 19/10/2026 · Trạng thái: **APPROVED** (owner duyệt r1 + khung giá §5 nguyên trạng, 19/10/2026; lệnh: bắt đầu G1 + G2). Các mục §8.2–8.7 vẫn mở, mặc định áp dụng cho tới khi owner chốt: hiển thị "từ … triệu/năm"; không nêu tên Hưng Nhân; CTA "Đặt lịch demo"; không quảng cáo dùng thử.
- Chế độ thực thi: Direct mode (một session, không board). Kế hoạch này + `project_checkpoint.md` là authority vận hành.
- Thư mục landing: `HUNG-NHAN/PlanGo/` · Domain dự kiến: `PlanGo.korus.vn`
- Framework nền: `C:\Data\1.Projects\Landing\landing1` (korus-web-framework, Astro 7 + Tailwind 4 + Vercel)
- Skill sử dụng: `kr-copywriting` (copy), `kr-design` (ảnh minh họa, OG, icon), `kr-motion-video` + `kr-video-vertical` + `kr-video-score` (video), `sb-ads-tracking-seo-standard` (SEO/tracking trước launch).

---

## 1. Nguồn dữ liệu đầu vào (đã khảo sát)

| Nguồn | Nội dung dùng cho landing |
|---|---|
| `README.md`, `docs/project-overview-pdr.md`, `docs/system-architecture.md` | Chức năng thật của sản phẩm (nhập đơn có duyệt, Gantt từng chuyền, 2–3 phương án kế hoạch, công suất = năng suất × lao động, BCTĐ, xuất KHSX Excel, audit, license theo máy, chạy local) |
| `docs/end-user-guide-garment-planner-v3.md` | Quy trình 7 bước vận hành hằng ngày → mục "Cách hoạt động" |
| `marketing-video/kich-ban/kich-ban-3-video-plango.md` | Bảng claims s1–s7 + 3 kịch bản video 9:16 (session *Dự án hungnhan-garment*) |
| `marketing-video/brand/` | Logo PlanGo (mark + lockup sáng/tối), 4 slogan |
| `brand_identity/derived/` | Logo KORUS bản sáng/tối đã chuẩn hóa |
| Owner (19/10/2026) | Tên **PlanGo**, website PlanGo.korus.vn, Hotline/Zalo 0912 610 011, chỉ tập trung ngành may mặc |

Màu thương hiệu (theo kịch bản video): Deep Blue Charcoal `#1F2933`, Clear Blue `#2563EB`, Sustainable Green `#16A34A`, Energy Red `#DC2626` (≤ 5 %, chỉ cảnh báo).

**Nguyên tắc nội dung (bắt buộc):** chỉ dùng claim có nguồn trong bảng s1–s7; không số liệu hiệu quả (giờ tiết kiệm, % đúng hạn), không testimonial, không logo khách hàng khi chưa có chấp thuận bằng văn bản; không từ ngữ tuyệt đối/cam kết ("nhất", "số 1", "duy nhất", "cam kết", "miễn phí", "trọn đời"); giá chỉ bằng VNĐ. Giao diện trong ảnh/video là **dữ liệu demo**, không phải dữ liệu Hưng Nhân.

### 1.1 Bổ sung owner 19/10/2026 — phải chỉ rõ ưu điểm/lợi ích

Landing phải nói rõ 4 lợi ích; mỗi lợi ích gắn với **cơ chế có thật trong mã nguồn** (căn cứ đã kiểm tra trong `planner-core/src/planner_core/planning/`):

| Mã | Lợi ích (thông điệp) | Cơ chế chứng minh trong sản phẩm | Nguồn |
|---|---|---|---|
| b1 | **Rút ngắn thời gian lập kế hoạch** — ra lệnh bằng chat, hệ thống tính và trả 2–3 phương án; không gom file, không tính tay | `generate-planning-options` sinh phương án tự động; nhập Excel có kiểm tra cột/ngày tự động; xuất KHSX Excel theo mẫu | `core_smart_planner.py`, `README.md`, `system-architecture.md` SB:plan/SB:in/SB:export |
| b2 | **Lịch sản xuất được tối ưu** — mỗi phương án được chấm điểm, hệ thống đề xuất phương án phù hợp mục tiêu | Chấm điểm theo: đúng hạn giao, cân bằng tải chuyền, khoảng trống chuyền rảnh, giờ tăng ca, số lần tách đơn, đồng bộ ngày hoàn thành; 3 hướng: *Ít xáo trộn kế hoạch đang chạy* · *Cân bằng toàn phân xưởng* · *Ưu tiên kịp hạn giao* | `optimizer_scoring.py`, `workshop_optimizer.py` (PROFILES A/B/C, `_recommend`) |
| b3 | **Tận dụng công suất các chuyền may** — thấy ngay chuyền nào rảnh/quá tải, xếp việc lấp khoảng trống | Công suất = năng suất × lao động hiệu dụng; phạt ngày chuyền nằm chờ (`idle_gap`); Gantt từng chuyền; báo `line_load_conflict`; chuyền thiếu dữ liệu được tách riêng, chuyền khác vẫn lập được | `optimizer_scoring.py`, `line_running_load.py`, `line_load_conflicts.py` |
| b4 | **Nền tảng nâng năng suất lao động** — giảm chờ việc, giảm tăng ca không cần thiết, theo dõi năng suất thực tế từng chuyền/đơn hằng ngày | Phạt tăng ca + khoảng trống trong chấm điểm; nhập sản lượng thực tế hằng ngày, so sánh kế hoạch–thực tế, cảnh báo biến động | `optimizer_scoring.py`, `daily_actuals_v3`, `variance-panel` dashboard |

Quy tắc trình bày lợi ích:
- Nói **định tính, gắn cơ chế** ("hệ thống tính 3 phương án trong một lệnh chat", "chấm điểm theo 6 tiêu chí") — đây là sự thật kiểm chứng được.
- **Chưa đăng con số** (giảm X giờ, tăng Y % năng suất, Z % công suất) cho tới khi có số đo thật. Câu "tăng năng suất" được viết dạng "giúp giảm chờ việc và tăng ca — nền tảng để nâng năng suất", không hứa kết quả.
- Không dùng chữ "nhất" (kể cả nhãn hệ thống "Ít xáo trộn nhất" → viết "Ít xáo trộn kế hoạch đang chạy").
- **Đề xuất bổ sung G9 — đo hiệu quả thí điểm** (khi owner đồng ý): ghi nhận trước/sau tại một nhà máy thí điểm 4–8 tuần: thời gian lập một kỳ kế hoạch, số ngày-chuyền chờ việc, giờ tăng ca, tỷ lệ đơn đúng hạn, năng suất bình quân/lao động. Có số đo + chấp thuận của nhà máy → cập nhật landing bằng số liệu có nguồn.

## 2. Cách tái sử dụng framework landing1

Kết quả khảo sát landing1:
- Phần **tái dùng nguyên trạng**: `LandingLayout` (header, footer, nút Zalo/gọi nổi, popup lead), `LeadForm`/`LeadModal` + `/api/leads` → Google Apps Script → Google Sheet + email, `SeoHead` (OG, canonical, JSON-LD), tracking GTM + consent, CSP chặt, `sitemap.xml`/`robots.txt`/`llms.txt`, bộ script `verify-*`.
- Phần **cấu hình qua profile**: `src/config/profiles/<id>.json` (brand, liên hệ, Zalo, màu `brand_1..10`, nav, SEO, lead/tracking) — chọn bằng biến môi trường `SITE_PROFILE`.
- Phần **phải viết mới**: `index.astro` (các section đang hard-code cho AiRobot), file copy, file product facts; `SeoHead` đang import trực tiếp `airobot-product` → phải đổi sang facts PlanGo.
- landing1 **không có** khối bảng giá, không có video → bổ sung 2 thành phần mới.

Phương án đề xuất: **sao chép framework vào `PlanGo/`** (không sửa landing1), giữ nguyên lõi, thay lớp nội dung:

```
PlanGo/
├─ rule.md, project_checkpoint.md          (bootstrap theo quy tắc dự án)
├─ src/config/profiles/landing-plango.json  (brand PlanGo, màu, 0912 610 011, Zalo, canonical PlanGo.korus.vn)
├─ src/content/plango-copy.ts               (copy từng section — nguồn duy nhất)
├─ src/content/plango-product.ts            (facts + mã claim s1–s7, dùng chung cho trang, JSON-LD, llms.txt)
├─ src/content/plango-pricing.ts            (dữ liệu gói, ma trận tính năng, khoảng giá)
├─ src/content/landing-contact.ts           (form: thêm trường "Số chuyền", "Số phân xưởng", "Gói quan tâm")
├─ src/components/plango/                   (PricingTable, PricingEstimator, FeatureMatrix, VideoHero, BeforeAfter)
├─ src/assets/plango/                       (ảnh master từ kr-design)
├─ public/media/                            (video mp4 + poster từ kr-motion-video)
└─ docs/  (copy handoff, product facts, spec ảnh, runbook deploy PlanGo)
```

Thay đổi kỹ thuật cần lưu ý: thêm `media-src 'self'` vào CSP cho video tự host; profile schema yêu cầu đủ key → copy từ `landing-robot.json` rồi sửa; `SITE_PROFILE` phải là biến môi trường thật (không đặt trong `.env`).

## 3. Cấu trúc trang (sitemap section)

| # | Section | Nội dung chính | Tài sản minh họa |
|---|---|---|---|
| S01 | Hero | H1 đề xuất: *"Lập kế hoạch chuyền may bằng chat — số liệu do hệ thống tính"*; sub: nhập đơn Excel → chọn phương án → Gantt từng chuyền; CTA chính **Đặt lịch demo**, CTA phụ **Nhắn Zalo** | Video hero 16:9 tự chạy, tắt tiếng, có poster (V4) |
| S01b | **Lợi ích chính** (ngay dưới hero) | 4 thẻ b1–b4: Rút ngắn thời gian lập kế hoạch · Lịch sản xuất được tối ưu · Tận dụng công suất chuyền · Nền tảng nâng năng suất lao động — mỗi thẻ 1 câu cơ chế | 4 icon + mini-minh họa Gantt trước/sau (dữ liệu minh họa, không con số) |
| S02 | Vấn đề | "Kế hoạch rải rác nhiều file?" 3 thẻ: số liệu lệch, không rõ chuyền nào rảnh, tính tay mất thời gian | Minh họa "nhiều file rời" (kr-design) |
| S03 | Cách cũ · Cách mới | Bảng so sánh 3 dòng (gom file tay → nhập có duyệt; đoán chuyền rảnh → Gantt từng chuyền; tính tay → hệ thống tính) | Khối BeforeAfter + video V3 |
| S04 | Cách hoạt động (3 bước) | 1 Nhập đơn từ Excel có kiểm duyệt · 2 Chọn 1 trong 2–3 phương án · 3 Xác nhận rồi mới lưu, xuất Excel KHSX | 3 ảnh mock giao diện (chat, thẻ phương án, nút xác nhận) |
| S05 | Tính năng | 6–8 thẻ: Gantt theo chuyền (thực tế/dự báo), công suất theo lao động, báo xung đột tải chuyền, BCTĐ hằng ngày, xuất KHSX/BCTĐ Excel, audit rủi ro, dashboard KPI theo xưởng | Bộ icon SVG + 1 ảnh dashboard lớn có hotspot (tái dùng cơ chế hotspot của landing1) |
| S06 | Tin cậy & an toàn dữ liệu | Dữ liệu lưu trên máy tại nhà máy; mọi thay đổi phải xem trước và xác nhận; license theo máy; AI chỉ điều phối, không đoán số | Minh họa "nhà máy + ổ dữ liệu + khóa" |
| S07 | **Bảng giá** | 3 gói + gói doanh nghiệp, ma trận tính năng, công cụ ước tính theo số chuyền (mục 5) | PricingTable + PricingEstimator |
| S08 | Lộ trình triển khai | Khảo sát xưởng → cài đặt & khai báo chuyền → nhập dữ liệu mẫu → đào tạo → chạy thật | Timeline 4–5 bước |
| S09 | Video ngắn | Dải 3 video 9:16 (V1–V3) cho người xem trên điện thoại | Video từ session hungnhan-garment |
| S10 | FAQ | Có cần thay Excel không? Dữ liệu lưu ở đâu? Cần máy tính gì? Cần tài khoản AI nào? Thêm chuyền tính phí thế nào? Hỗ trợ ra sao? | — |
| S11 | Liên hệ | Form lead (họ tên, SĐT, nhà máy, số chuyền, số phân xưởng, gói quan tâm, ghi chú) + Hotline/Zalo | — |
| — | Footer | Bản quyền Công ty Cổ phần Công nghệ KORUS, liên hệ, chính sách, cookie | Logo PlanGo + by KORUS |

Trang phụ giữ từ framework: `/privacy/`, `/terms/`, `/thank-you/`, `404`, `500`.

## 4. Danh mục tài sản cần sản xuất

### 4.1 kr-design (code-native HTML/SVG → PNG/AVIF, chữ và logo dựng chính xác, dữ liệu demo)

| Mã | Tài sản | Kích thước | Ghi chú |
|---|---|---|---|
| D1 | Poster hero (khung đầu video) | 1920×1080, ≤ 200 KB | Dashboard Gantt M1K1…M2K4 dữ liệu demo |
| D2 | Ảnh dashboard lớn có hotspot | 1600×1000 | Dùng cho S05 |
| D3–D5 | 3 mock bước (chat / thẻ phương án A-B-C / xác nhận) | 960×720, ≤ 60 KB | S04 |
| D6 | Minh họa "nhiều file rời" | 960×720 | S02 |
| D7 | Minh họa an toàn dữ liệu tại nhà máy | 960×720 | S06 |
| D8 | Bộ 8 icon tính năng | SVG 24/48 px | Nét đồng nhất, màu thương hiệu |
| D9 | Ảnh OG/chia sẻ Zalo-Facebook | 1200×630 | Logo PlanGo + thông điệp chính |
| D10 | Banner quảng cáo kèm landing (tùy chọn) | 1080×1080, 1200×628, 1080×1920 | Cho chạy ads dẫn về landing |

Hạn mức trang: tổng ảnh tải lần đầu < 500 KB (theo `SPEC_ANH_THIET_KE.md` của framework).

### 4.2 kr-motion-video

| Mã | Video | Khung | Trạng thái |
|---|---|---|---|
| V1 | "Rải rác nhiều file" 15 s | 9:16 | Session *Dự án hungnhan-garment* đang làm → landing chỉ **nhận file giao** |
| V2 | "Lập kế hoạch bằng chat" 30 s | 9:16 | như trên |
| V3 | "Cách cũ · Cách mới" 15 s | 9:16 | như trên |
| V4 | **Hero loop landing** 12–20 s, không chữ dày, lặp mượt (`loop: true`) | 16:9 | **r3: do session hungnhan-garment sản xuất**; landing chỉ có khe nhúng `plango-hero-16x9.mp4` (`docs/VIDEO_HANDOFF.md`); khung dự phòng `video-src/v4-hero-loop` |
| V5 | Bản 16:9 của V2 (demo 30 s) cho mục S04/YouTube | 16:9 | **r3: như V4**; khe `plango-demo-16x9.mp4`; dự phòng `video-src/v5-chat-demo` |

Giao file: `_social.mp4` (H.264) + `_small.mp4` + poster; trên landing nhúng bản ≤ 3–4 MB, `preload="none"` (trừ hero `preload="metadata"`), `muted playsinline`, có nút dừng, tôn trọng `prefers-reduced-motion` (chỉ hiện poster).

Phối hợp: thư mục `marketing-video/` thuộc session *Dự án hungnhan-garment*; landing **không sửa** thư mục đó, chỉ copy file đã giao sang `PlanGo/public/media/`.

## 5. Phương án gói & khoảng giá (đề xuất để owner chốt)

### 5.1 Tham chiếu thị trường

- Phần mềm quản lý may/ERP quốc tế niêm yết dạng phí cố định khoảng 125–600 USD/tháng hoặc 59–200 USD/người dùng/tháng; công cụ lập kế hoạch chuyên sâu (FastReactPlan) không công bố giá.
- ERP trong nước tính theo phân hệ, mỗi phân hệ khoảng 90–320 triệu đồng triển khai một lần (MISA).
- PlanGo khác biệt: chạy tại máy nhà máy (không phí máy chủ), license theo máy, thao tác bằng chat → chi phí vận hành của KORUS thấp; nên định giá **dưới mức ERP**, **tính theo số chuyền** vì giá trị tăng theo quy mô chuyền cần lập kế hoạch.

### 5.2 Mô hình tính phí

- **r4 (owner 19/10/2026): phí bản quyền thuê bao TÍNH THEO THÁNG** (license theo máy) + **phí triển khai một lần** (khảo sát, khai báo xưởng/chuyền, chuyển mẫu Excel, đào tạo).
- Tiêu chí phân gói: (1) số chuyền, (2) số phân xưởng, (3) nhóm chức năng, (4) mức hỗ trợ.
- Tùy chọn **mua đứt** cho nhà máy không muốn thuê bao: ≈ 30 tháng phí thuê bao + 20 %/năm bảo trì cập nhật (từ năm 2).

### 5.3 Ba gói + gói doanh nghiệp

| | **Cơ bản** | **Tiêu chuẩn** | **Nâng cao** | **Doanh nghiệp** |
|---|---|---|---|---|
| Đối tượng | Xưởng nhỏ, 1 phân xưởng | Nhà máy vừa, nhiều phân xưởng | Nhà máy lớn | Tập đoàn / nhiều nhà máy |
| Số chuyền | đến 5 | 6–15 | 16–40 | > 40 hoặc nhiều nhà máy |
| Số phân xưởng | 1 | đến 4 | không giới hạn trong 1 nhà máy | nhiều nhà máy |
| Máy cài đặt (license) | 1 | 1 | 2 | theo thỏa thuận |
| **Phí thuê bao (owner chốt r4)** | **từ 3 triệu/tháng** | **từ 5 triệu/tháng** | **từ 9 triệu/tháng** | Báo giá riêng |
| **Phí triển khai 1 lần** | 8–12 triệu | 20–30 triệu | 40–60 triệu | Báo giá riêng |
| Thêm chuyền ngoài hạn mức | 300–400 nghìn/chuyền/tháng | 250–350 nghìn | 200–300 nghìn | — |

Ví dụ đối chiếu: nhà máy cỡ Hưng Nhân (4 phân xưởng, 9 chuyền) → gói Tiêu chuẩn, từ 5 triệu/tháng + 20–30 triệu triển khai.

### 5.4 Ma trận chức năng (theo tính năng đã có trong sản phẩm)

| Chức năng | Cơ bản | Tiêu chuẩn | Nâng cao |
|---|:-:|:-:|:-:|
| Khai báo xưởng/chuyền, lịch làm việc, công suất = năng suất × lao động | ✓ | ✓ | ✓ |
| Nhập đơn hàng Excel có kiểm duyệt (mẫu chuẩn đầy đủ/rút gọn) | ✓ | ✓ | ✓ |
| Gantt từng chuyền, tách thực tế / dự báo, bảng tiến độ tháng | ✓ | ✓ | ✓ |
| Nhập sản lượng thực tế hằng ngày (dashboard / chat) | ✓ | ✓ | ✓ |
| Xuất Excel kế hoạch KHSX | ✓ | ✓ | ✓ |
| Lập 2–3 phương án kế hoạch toàn nhà máy, chọn rồi mới lưu | — (1 phương án) | ✓ | ✓ |
| Báo xung đột tải chuyền, KPI theo phân xưởng | — | ✓ | ✓ |
| Nhập/xuất BCTĐ tháng (báo cáo tiến độ) có xem trước | — | ✓ | ✓ |
| Bổ sung đơn hàng, chuyển lô, điều chỉnh có duyệt | — | ✓ | ✓ |
| Báo cáo audit rủi ro & báo cáo giải thích kế hoạch (DOCX) | — | — | ✓ |
| Chuyển đổi mẫu Excel riêng của nhà máy (mapping tùy biến) | — | 1 mẫu | đến 3 mẫu |
| Hỗ trợ | Zalo/email giờ hành chính | + điều khiển từ xa | + đào tạo tại nhà máy, ưu tiên xử lý |
| Cập nhật phiên bản | ✓ | ✓ | ✓ |

> Lưu ý: việc khóa/mở chức năng theo gói **chưa có trong sản phẩm** (license hiện chỉ ràng buộc theo máy). Nếu owner duyệt ma trận này, cần một hạng mục riêng bổ sung "giới hạn gói trong license" ở planner-core (ngoài phạm vi landing — đề xuất làm session riêng).

### 5.5 Hiển thị trên landing

- Hiển thị dạng **"từ … triệu/tháng"** (r4) + nút "Nhận báo giá chi tiết" mở form với gói đã chọn sẵn.
- Công cụ ước tính: nhập số chuyền + số phân xưởng → gợi ý gói và mức phí "từ … triệu/tháng" (chỉ ước tính, ghi chú "báo giá chính thức sau khảo sát").
- Không dùng "miễn phí", "giảm giá có hạn", "cam kết"; nếu có dùng thử, ghi "Dùng thử 14 ngày trên dữ liệu mẫu" (cần owner xác nhận dịch vụ có thật).

## 6. Lead, tracking, SEO

- Lead: giữ pipeline Apps Script → Google Sheet riêng cho PlanGo + email thông báo; thêm cột số chuyền, phân xưởng, gói quan tâm, nguồn (utm). Biến môi trường mới: `GOOGLE_SHEET_WEBHOOK_URL`, `WEBHOOK_SECRET`, `LEAD_ALLOWED_ORIGINS=https://plango.korus.vn` (owner cung cấp/tạo).
- Tracking: GTM container riêng (owner cung cấp `PUBLIC_GTM_ID`), sự kiện: `lead_submit`, `click_zalo`, `click_hotline`, `select_plan`, `estimator_use`, `video_play`. Banner consent giữ nguyên.
- SEO: title/description tiếng Việt quanh "phần mềm lập kế hoạch sản xuất may", JSON-LD `SoftwareApplication` + `Organization` + `FAQPage`; `llms.txt` sinh từ `plango-product.ts`; OG D9. Chạy `sb-ads-tracking-seo-standard` trước khi bật index.

## 7. Các giai đoạn thực hiện

| GĐ | Công việc | Skill | Đầu ra / bằng chứng | Ước lượng |
|---|---|---|---|---|
| G0 | Owner duyệt kế hoạch + chốt các mục ở §8 | — | Kế hoạch r2 "APPROVED" | — |
| G1 | Bootstrap `PlanGo/`: copy framework, `rule.md`, `project_checkpoint.md`, profile `landing-plango`, chạy được trang trống | — | `npm run check` 0 lỗi, `npm run build` qua | 0,5 ngày |
| G2 | Copy toàn trang + product facts + pricing data; 3 phương án hook/CTA, legal gate | kr-copywriting | `docs/plango_landing_copy.md`, `plango-copy.ts`, `plango-pricing.ts` → **owner duyệt copy** | 1 ngày |
| G3 | Tài sản hình ảnh D1–D9 | kr-design | `src/assets/plango/*`, contact sheet → **owner duyệt hình** | 1–1,5 ngày |
| G4 | **r3 (owner 19/10):** landing KHÔNG sản xuất video; chỉ nhận file giao vào `public/media/` theo `docs/VIDEO_HANDOFF.md` | — | Khe video tự nhận file lúc build | — |
| G5 | Dựng trang: section S01–S11, component Pricing/Estimator/Video/BeforeAfter, form mở rộng, CSP media | — | Trang chạy local; kiểm tra 375 px / 768 px / 1440 px | 1,5 ngày |
| G6 | Kiểm tra: `npm run verify`, `verify:landing`, link nội bộ, Lighthouse (mục tiêu ≥ 90 hiệu năng mobile), test gửi lead thật vào Sheet thử | sb-ads-tracking-seo-standard | Báo cáo QA | 0,5 ngày |
| G7 | Triển khai Vercel preview → owner duyệt → trỏ `PlanGo.korus.vn`, bật index | — | URL preview, rồi URL chính | 0,5 ngày (sau khi có DNS/Vercel) |
| G8 | Đồng bộ tài liệu: README PlanGo, runbook deploy, product facts; ghi "SRS sản phẩm không đổi" | — | docs cập nhật | cùng G5–G7 |

Tổng ước lượng: ~6–7 ngày làm việc, có 3 điểm owner duyệt (copy, hình, preview).

## 8. Cần owner quyết định trước khi làm

1. **Khung giá & ma trận gói** ở §5 (giữ, chỉnh mức, hay chỉ hiện "Liên hệ báo giá"?). Có hiển thị số tiền công khai trên landing không?
2. Có **mua đứt** song song thuê bao không?
3. **Chi phí trợ lý AI**: PlanGo vận hành qua Codex/Antigravity — tài khoản AI do nhà máy tự trang bị hay KORUS cung cấp kèm gói? (ảnh hưởng FAQ và giá).
4. **Dịch vụ demo/dùng thử** có thật không, hình thức nào (demo online qua Zalo/Meet, dùng thử 14 ngày dữ liệu mẫu)?
5. Có được nhắc **Hưng Nhân** như khách hàng đầu tiên/nhà máy tham chiếu không? (cần chấp thuận bằng văn bản; mặc định: **không** nêu tên).
6. Hạ tầng: tài khoản Vercel, DNS `PlanGo.korus.vn`, Google Sheet + Apps Script nhận lead, GTM ID, email nhận thông báo lead.
7. Có làm mục giới hạn chức năng theo gói trong license sản phẩm (session riêng) không?

## 9. Rủi ro & cách kiểm soát

| Rủi ro | Kiểm soát |
|---|---|
| Claim vượt chức năng thật | Mọi câu trên trang gắn mã claim trong `plango-product.ts`; legal gate của kr-motion-video chạy cả cho copy landing |
| Bảng giá hứa chức năng chưa khóa được theo gói | Ghi rõ gói Cơ bản/Tiêu chuẩn khác nhau ở hỗ trợ & mapping trước; khóa kỹ thuật làm sau (mục 8.7) |
| Video làm nặng trang | Poster AVIF + `preload="none"`, video ≤ 4 MB, mobile dùng bản 4:5 nhỏ |
| Trùng việc với session hungnhan-garment | Landing chỉ đọc/copy file giao từ `marketing-video/`, không sửa |
| CSP chặn video/GTM | Thêm `media-src 'self'`, chạy `verify` + kiểm tra console trên preview |

---
*Bước tiếp theo khi được duyệt: G1 bootstrap `PlanGo/` và G2 copy (song song chuẩn bị brief hình cho G3).*
