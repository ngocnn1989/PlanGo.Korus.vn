# Runbook triển khai landing PlanGo (Vercel + PlanGo.korus.vn)

Thứ tự: **A. Vercel preview → B. Kênh lead → C. Domain → D. Mở index → E. Kiểm tra sau go-live**. Mỗi bước có điều kiện "đạt" rõ ràng; chưa đạt thì không sang bước sau.

## A. Tạo project Vercel (bản preview, chưa cần Sheet)

1. Vercel → **Add New → Project → Import** repo `ngocnn1989/PlanGo.Korus.vn` (branch `main`).
2. Framework preset: **Astro** (tự nhận). Build command: `npm run build` (đã có `postbuild` chuẩn hoá CSP). Output: để mặc định (adapter `@astrojs/vercel`). Node.js: **22.x** trở lên.
3. Environment Variables (Production + Preview):

| Biến | Giá trị lúc này |
|---|---|
| `SITE_PROFILE` | `landing-plango` (**bắt buộc** — thiếu là build dừng) |
| `LEAD_PROVIDER`, `GOOGLE_SHEET_WEBHOOK_URL`, `WEBHOOK_SECRET`, `LEAD_ALLOWED_ORIGINS` | để trống (form vẫn hiện, gửi sẽ hướng khách gọi hotline/Zalo) |
| `PUBLIC_ENABLE_TRACKING`, `PUBLIC_GTM_ID` | để trống tới khi có GTM PlanGo |

4. Deploy. **Đạt khi:** mở URL `*.vercel.app` thấy trang PlanGo; bấm "Đặt lịch demo" mở popup; `/thank-you/`, `/privacy/`, `/terms/`, `/llms.txt` mở được; trang có `noindex` (đúng, vì chưa go-live).

## B. Kênh nhận lead (khi đã có Google Sheet)

Làm theo `docs/HUONG_DAN_LEAD_SHEET.md` (tạo Sheet, dán `docs/apps-script/lead-webhook.gs`, Script properties, deploy Web app). Sau đó đặt 4 biến `LEAD_*` trên Vercel:

- `LEAD_PROVIDER=google_sheets`
- `GOOGLE_SHEET_WEBHOOK_URL=https://script.google.com/macros/s/<ID>/exec`
- `WEBHOOK_SECRET=<đúng chuỗi trong Script properties>`
- `LEAD_ALLOWED_ORIGINS=https://plango.korus.vn` (khi đang thử trên preview: đặt đúng origin preview `https://<project>.vercel.app`, go-live thì đổi lại)

**Redeploy** (biến chỉ có hiệu lực sau build). **Đạt khi:** gửi 1 lead thật → chuyển `/thank-you/`, Sheet có dòng, hộp thư `NOTIFY_EMAIL` có mail `[PlanGo - Tự động] Lead mới: …`. Xoá dòng thử.

## C. Domain PlanGo.korus.vn

1. Vercel → Project → **Settings → Domains → Add** `plango.korus.vn`.
2. Tại nơi quản lý DNS của `korus.vn`: thêm bản ghi **CNAME** `plango` → `cname.vercel-dns.com` (theo đúng giá trị Vercel hiển thị).
3. Đặt `plango.korus.vn` làm **Primary**. Nếu thêm `www.plango.korus.vn` thì để redirect về Primary.
4. **Đạt khi:** `https://plango.korus.vn` có chứng chỉ SSL, và `LEAD_ALLOWED_ORIGINS` = đúng `https://plango.korus.vn` (lệch www/không www là lead bị 403).

## D. Mở cho Google index (go-live)

1. Sửa `src/config/profiles/landing-plango.json`: `"indexable": true` (canonical đã là `https://plango.korus.vn`).
2. Chạy `npm run verify` + `SITE_PROFILE=landing-plango npm run build` + `SITE_PROFILE=landing-plango npm run verify:landing` → commit → push (Vercel tự deploy).
3. **Đạt khi:** trang chủ không còn `noindex`; `/sitemap.xml` liệt kê `/`, `/privacy/`, `/terms/`; `/robots.txt` trỏ sitemap.
4. Google Search Console: thêm thuộc tính `https://plango.korus.vn`, gửi `sitemap.xml`.

## E. Tracking (khi có GTM PlanGo)

`PUBLIC_ENABLE_TRACKING=true`, `PUBLIC_GTM_ID=GTM-XXXX` → Redeploy. Sự kiện đẩy vào `dataLayer`: chuyển đổi gửi form (có receipt chống trùng), `estimator_use`, `video_play`, các nút có `data-cta`. Origin GA4/Meta đã có trong CSP; thêm nền tảng quảng cáo khác thì mở rộng `ORIGIN_POLICY` trong `scripts/normalize-vercel-csp-routes.mjs`, không tắt CSP.

## Video

Khi session video giao file: đặt vào `public/media/` đúng tên trong `docs/VIDEO_HANDOFF.md` → build → commit → push. Không cần đổi mã.

## Quay lui

Vercel → Deployments → chọn bản trước → **Promote to Production**. Biến môi trường không đổi theo bản deploy — nếu sự cố do biến, sửa biến rồi Redeploy.
