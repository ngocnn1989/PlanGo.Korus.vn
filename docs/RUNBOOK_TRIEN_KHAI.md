# Hướng dẫn triển khai — weldbot.tech

**Cập nhật:** 2026-09-10 · **Áp dụng cho:** kho `ngocnn1989/weldbot.tech`, domain `https://weldbot.tech`

Tài liệu này là hướng dẫn **thao tác**. Nó không cấp quyền triển khai; quyền đó thuộc chủ sở hữu.
Tài liệu ranh giới và chính sách là `docs/WEB_DEPLOYMENT_HANDBOOK.md`.

---

## 1. Kiến trúc triển khai

```
Sửa code  →  git push origin main  →  GitHub
                                        │
                                        ├─→ GitHub Actions (.github/workflows/ci.yml)
                                        │     npm run verify → npm run check → npm run build
                                        │     CHỈ kiểm chứng. Không deploy.
                                        │
                                        └─→ Vercel Git Integration
                                              build trên Linux → deploy production
```

Lead đi đường riêng, không qua Vercel build:

```
Form trên trang  →  POST /api/leads  →  lead-request (validate, origin, rate limit,
                                          honeypot, idempotency, consent)
                                     →  lead-dispatch  →  Google Apps Script  →  Google Sheets
```

---

## 2. Chuẩn bị một lần

### 2.1 Biến môi trường trên Vercel

`Vercel → <project của weldbot.tech> → Settings → Environment Variables`

| Biến | Môi trường | Giá trị | Bắt buộc |
|---|---|---|---|
| `SITE_PROFILE` | Production + Preview | `landing-robot` | **Có** — thiếu là build fail `SITE_PROFILE_MISSING` |
| `LEAD_PROVIDER` | Production + Preview | `google_sheets` | Có, nếu bật form |
| `GOOGLE_SHEET_WEBHOOK_URL` | Production + Preview | URL `/exec` của Apps Script | Có, nếu bật form |
| `WEBHOOK_SECRET` | Production + Preview | chuỗi ngẫu nhiên, khớp Script Property | Có, nếu bật form |
| `LEAD_ALLOWED_ORIGINS` | Production + Preview | `https://weldbot.tech` | Có, nếu bật form |
| `PUBLIC_ENABLE_TRACKING` | Production | `true` khi sẵn sàng đo lường | Không |
| `PUBLIC_GTM_ID` | Production | container GTM thật | Không |
| `PUBLIC_TRACKING_DELAY_MS` | Production | `0` | Không |

**Ba cạm bẫy đã gặp thật:**

1. `LEAD_ALLOWED_ORIGINS` **chỉ chấp nhận https, không cổng, không đường dẫn**. Ghi `http://localhost:4321` sẽ làm endpoint lead trả 503 vĩnh viễn.
2. Đổi biến môi trường **không có hiệu lực cho tới khi redeploy**. `resolveRuntimeLeadActivation` đọc `import.meta.env` lúc prerender.
3. `SITE_PROFILE` đặt trong file `.env` **không có tác dụng khi build local** — `astro.config.mjs` gọi `loadSiteProfile()` trước khi Vite đọc `.env`. Trên Vercel thì đúng vì env vars là process env thật.

### 2.2 Google Apps Script

Script phải đọc được **cả form-encoded lẫn JSON**, kiểm tra `webhook_secret` **trong body** (Apps Script không đọc được HTTP header tùy chỉnh), và trả về `{"result":"success","row":N}`.

Secret đặt tại `Project Settings → Script Properties`, key `WEBHOOK_SECRET`. Không hardcode vào code.

Tạo chuỗi ngẫu nhiên:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**Thứ tự bắt buộc khi rotate:** sửa code script và đặt Script Property → tạo deployment mới rồi archive cái cũ → cập nhật env Vercel → redeploy. Làm ngược sẽ có khoảng thời gian form gửi được nhưng script từ chối.

---

## 3. Quy trình triển khai thường ngày

```bash
git checkout -b fix/mo-ta-ngan
# ... sửa code ...
npm run verify        # 11 cổng kiểm chứng + 8 test luồng lead
```

```bash
SITE_PROFILE=landing-robot npm run build
```

```bash
npm run verify:links  # kiểm tra đồ thị liên kết trên HTML đã build
```

Cả ba phải exit 0 trước khi commit. Rồi:

```bash
git checkout main && git merge --ff-only fix/mo-ta-ngan && git push origin main
```

Push xong, Vercel tự build và deploy. Theo dõi tại `Vercel → Deployments`.

---

## 4. Các lệnh kiểm chứng

| Lệnh | Kiểm tra gì |
|---|---|
| `npm run verify` | Toàn bộ: profile, tracking, lead, consent, SEO, marketing, CSP, publisher, contracts, test |
| `npm test` | 8 test luồng lead: receipt duy nhất, chống gửi trùng, secret trong body, fail-closed |
| `npm run verify:links` | Liên kết chết, anchor sai, route không tồn tại, trang mồ côi trong sitemap |
| `npm run verify:csp` | Guard CSP: từ chối wildcard, `unsafe-inline`, origin ngoài allowlist |
| `npm run check` | Typecheck (hiện 20 lỗi, tập trung ở mã i18n không chạy) |

`npm run verify:links` **phải chạy sau build** vì nó đọc `dist/client`.

---

## 5. Thêm origin quảng cáo vào CSP

Khi cần thêm nền tảng đo lường mới:

1. Thêm origin vào `astro.config.mjs` ở đúng directive (`script-src`, `connect-src`, `img-src`, `frame-src`).
2. Thêm cùng origin vào `ORIGIN_POLICY` trong `scripts/normalize-vercel-csp-routes.mjs`.

**Mở rộng allowlist, không vô hiệu hóa guard.** Guard này chặn wildcard và `unsafe-inline`; bỏ nó là mở cửa cho XSS. Nếu quên bước 2, build sẽ fail — đó là hành vi đúng.

---

## 6. Danh sách kiểm tra trước khi bật quảng cáo

- [ ] `indexable: true` trong `src/config/profiles/landing-robot.json` (hiện đang `false`)
- [ ] Nội dung sản phẩm và giá đã đúng thực tế
- [ ] Địa chỉ pháp nhân thật trong `company_info.address`
- [ ] `/privacy` và `/terms` đã qua pháp chế, gỡ khối cảnh báo bản thảo
- [ ] Hồ sơ Nghị định 13 / Luật Bảo vệ dữ liệu cá nhân đã lập
- [ ] `WEBHOOK_SECRET` đã đặt và Apps Script đã kiểm tra nó
- [ ] Submit thử một lead thật: sheet có dòng mới, cột "Đồng ý lúc" có giá trị
- [ ] Kiểm chứng trên browser thật: trước khi bấm đồng ý có **0** request tới `googletagmanager.com`; sau khi đồng ý thì GA4 Realtime và Meta Pixel Helper đều nhận tín hiệu; Console **0** vi phạm CSP
- [ ] `npm run verify` và `npm run verify:links` đều exit 0

---

## 7. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| Build fail `SITE_PROFILE_MISSING` | Chưa đặt biến `SITE_PROFILE` trên Vercel |
| `/api/leads` trả 503 | `LEAD_ALLOWED_ORIGINS` sai định dạng, hoặc thiếu biến lead |
| Form báo lỗi, sheet không có dòng mới | Secret lệch giữa Script Property và Vercel; hoặc chưa redeploy sau khi đổi env |
| Lead vào sheet nhưng bị trùng dòng | Apps Script chưa kiểm tra `idempotency_key` |
| Tracking không chạy dù đã bật | Chưa bấm đồng ý; hoặc `PUBLIC_GTM_ID` sai; hoặc chưa redeploy |
| GA4 không nhận hit dù GTM đã tải | CSP thiếu origin — xem mục 5 |
| Build fail sau khi sửa CSP | Quên cập nhật `ORIGIN_POLICY`. Đây là guard hoạt động đúng |

**Xem log lead:** `Vercel → Deployments → Functions → /api/leads`. Mỗi lead phát một dòng JSON có `event` và `correlation_id` (chính là `idempotency_key`). Log không chứa nội dung lead vì đó là dữ liệu cá nhân.

---

## 8. Rollback

Vercel giữ mọi deployment trước đó. `Deployments → chọn bản tốt gần nhất → Promote to Production`.

Rollback code thì revert commit rồi push:

```bash
git revert <commit-hash> && git push origin main
```

Không sửa trực tiếp trên production, không sửa output đã build.

---

## 9. Tài liệu liên quan

| Tài liệu | Nội dung |
|---|---|
| `docs/WEB_DEPLOYMENT_HANDBOOK.md` | Ranh giới, chính sách, route map |
| `docs/audit/2026-09-07_Comprehensive_audit_report.md` | Báo cáo kiểm toán độc lập |
| `docs/audit/2026-09-07_remediation-plan.md` | Kế hoạch khắc phục 9 phase |
| `docs/audit/2026-09-07_evidence/` | Bằng chứng kiểm toán |
| `project_checkpoint.md` | Hiện trạng dự án |
| `rule.md` | Ràng buộc kỹ thuật cần biết trước khi sửa |
| `docs/SPEC_ANH_THIET_KE.md` | Spec kích thước ảnh để gửi designer |
