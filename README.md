# PlanGo — Landing page

Landing quảng cáo phần mềm lập kế hoạch sản xuất may **PlanGo** (Công ty Cổ phần Công nghệ KORUS). Domain dự kiến: `PlanGo.korus.vn`. Repo: `github.com/ngocnn1989/PlanGo.Korus.vn` (chỉ chứa landing).

Dựng trên korus-web-framework (Astro 7 + Tailwind 4 + Vercel), sao chép từ `Landing/landing1` @6838630.

## Đọc trước

1. `rule.md` — quy tắc dự án (nội dung, legal, kỹ thuật).
2. `project_checkpoint.md` — trạng thái hiện tại.
3. `KE-HOACH-LANDING-PLANGO.md` — kế hoạch đã duyệt (gói, khung giá, giai đoạn).

## Nguồn nội dung

| File | Vai trò |
|---|---|
| `src/content/plango-product.ts` | Dữ kiện có nguồn: lợi ích b1–b4, claims s*/f*, tiêu chí tối ưu |
| `src/content/plango-pricing.ts` | Gói, khung giá, ma trận chức năng |
| `src/content/plango-copy.ts` | Copy toàn trang (bản duyệt: `docs/plango_landing_copy.md`) |
| `src/content/landing-contact.ts` | Form demo, trạng thái gửi, trang cảm ơn |
| `src/content/landing-copy.ts` | Lớp ghép cho component dùng chung của framework |
| `src/config/profiles/landing-plango.json` | Brand, màu, liên hệ, SEO, `indexable` |
| `design-src/*.html` → `src/assets/plango/*.png` | Ảnh minh họa code-native (`node design-src/render.mjs`) |
| `public/media/` | Video do session hungnhan-garment giao (`docs/VIDEO_HANDOFF.md`) |

## Lệnh

```bash
npm ci
SITE_PROFILE=landing-plango npm run dev
SITE_PROFILE=landing-plango npm run build
npm run verify
SITE_PROFILE=landing-plango npm run verify:landing
npm run legal
```

Windows (cmd): `set SITE_PROFILE=landing-plango&& npm run build`.

## Lead

Form gửi `/api/leads` → Google Apps Script (`docs/apps-script/lead-webhook.gs`) → Google Sheet + email. Trường `application` = gói quan tâm (`co-ban | tieu-chuan | nang-cao | doanh-nghiep | undecided`). Biến môi trường trên Vercel: `LEAD_PROVIDER`, `GOOGLE_SHEET_WEBHOOK_URL`, `WEBHOOK_SECRET`, `LEAD_ALLOWED_ORIGINS`. Thiếu biến thì form không hiển thị (local mặc định).
