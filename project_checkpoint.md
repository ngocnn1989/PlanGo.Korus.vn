# Project Checkpoint — PlanGo Landing

- Project/root: `HUNG-NHAN/PlanGo`
- Updated at/owner/trigger: `2026-11-25` / Claude (Direct mode) / D-15: mở CSP cho Google Ads theo dev brief 25/11
- Freshness: `current`
- Overall state: `on_track`

## Authority

1. Rule: `rule.md`
2. Plan: `KE-HOACH-LANDING-PLANGO.md` (PLANGO-LP-01 r4, APPROVED 19/10/2026)
3. Board: Direct mode (không board)
4. Framework source: `Landing/landing1` commit `6838630`; nội dung gốc AiRobot lưu ở `docs/_framework-origin/`
5. Repo: `github.com/ngocnn1989/PlanGo.Korus.vn` (branch `main`)

## Gantt / trạng thái giai đoạn

| GĐ | Nội dung | Trạng thái | Bằng chứng | Bước tiếp |
|---|---|---|---|---|
| G0 | Owner duyệt kế hoạch + khung giá | DONE | Owner chat 19/10/2026 | — |
| G1 | Bootstrap framework, profile `landing-plango`, git remote | DONE | commit `a8676f4` | — |
| G2 | Copy, facts (b1–b4, s1–s7, f1–f8), pricing | DONE | Owner duyệt 19/10 (Hero A, mặc định §3) | — |
| G3 | Ảnh code-native D1–D9 (`design-src/` → `src/assets/plango/`) | DONE | contact sheet soát 19/10; icon SVG `components/plango/Icon.astro` | Owner duyệt hình trên bản dựng |
| G4 | Video | TẠM NGƯNG | Owner 19/10 (D-13): bỏ video khỏi landing; file v3.1 giữ ở `media-archive/`; khung dự phòng `video-src/` | — |
| G4b | Nghiên cứu khách hàng + đề xuất chỉnh lý landing + video V5 "Một vòng kế hoạch – tiến độ" (16:9 + 9:16, 30 s) | REVIEW | `docs/DE-XUAT-TRUYEN-THONG-PLANGO.md` (legal 0 lỗi); `video-src/v5-chat-demo/` (KICH-BAN.md, storyboard, legal final 55/55) | Owner duyệt đề xuất §4.15 + video; nếu đạt: chép `_social.mp4` 16:9 vào `public/media/plango-demo-16x9.mp4` |
| G4c | Video V6 9:16 (A "Tơ vò" bản 2, B "Bản tin chuyền may", C "Cắt · May · Là · Duyệt") theo `video-src/KICH-BAN-QUANG-CAO-V6.md` | REVIEW | `video-src/v6a-to-vo`, `v6b-ban-tin`, `v6c-cat-may`: QA PASS (WARN phone_sim), deliver PASS, legal final đạt; bản 1 V6-A ở `v6a-to-vo/_v1/` | Owner 20/10: chưa đủ sức mạnh → V7 |
| G4d | 3 kịch bản V7 (âm thanh xưởng mở đầu): `video-src/KICH-BAN-QUANG-CAO-V7.md` | IN-PROGRESS | legal 0 lỗi; owner 20/10: cách 2 (tổng hợp bằng code), dựng V7-A 9:16 trước | V7-B, V7-C chờ owner |
| G4e | V7-A "Nhịp xưởng" 9:16: `video-src/v7a-nhip-xuong` (rhythm.js chung hình–tiếng, factory.mjs tổng hợp âm thanh xưởng, music.file; energy 0 để KV không nhún theo phách) | REVIEW | QA PASS (TP −2,1, −14,1 LUFS), deliver PASS, legal final 53/53 | Owner nghe duyệt âm thanh |
| G4f | 5 kịch bản V10 bám nghiên cứu khách hàng + landing: `video-src/KICH-BAN-QUANG-CAO-V10.md` (legal 0 lỗi); owner 20/10 duyệt dựng V10-2 | IN-PROGRESS | — | V10-1, 3, 4, 5 chờ owner |
| G4g | V10-2 "Nhận thêm đơn không?" 9:16: `video-src/v10b-nhan-don` (rhythm.js chung hình–tiếng, call.js: cuộc gọi chia đôi, ống chỉ tung như đồng xu, công suất theo lao động, Gantt chỗ trống, 3 phương án + cờ rủi ro trễ; factory.mjs: xưởng, chuông điện thoại, nhịp tim, đồng hồ, gõ phím) | REVIEW | QA PASS (−14,2 LUFS, TP −1,7), deliver PASS, legal final 81/81 | Owner xem + nghe duyệt |
| G4h | 3 kịch bản V11 theo 7 tiêu chí owner 20/10 (nhận ra trong 3–5 s, nỗi đau → lợi ích, viết cho thuật toán phân phối): `video-src/KICH-BAN-QUANG-CAO-V11.md` — A "Vè kế hoạch", B "Đã mắt", C "3 bước" | REVIEW | legal 0 lỗi | Owner chọn kịch bản dựng (đề xuất V11-B), quyết giọng đọc |
| G4i | Dựng 3 video V11 9:16 (owner 20/10 "dựng 3 kịch bản v11"): `video-src/v11a-ve-ke-hoach`, `v11b-da-mat`, `v11c-ba-buoc`; âm thanh xưởng dùng chung `video-src/shared/garment-sounds.mjs` | REVIEW | legal final đạt cả 3; QA PASS cả 3 (−14,1 LUFS; TP −1,4 / −1,5 / −1,6); deliver PASS; khung giao diện đã kéo khỏi vùng nút bên phải 9:16 | Owner xem + nghe; quyết giọng đọc V11-A |
| G4j | V11-B bản 2 `video-src/v11b2-da-mat` (owner 20/10: hook cụt, chưa khoét nỗi đau, nhạc trầm): chỉ thay hook 0–4 s; bản 1 `v11b-da-mat` giữ làm dự phòng | DONE (owner 20/10 chọn bản 2) | QA PASS (−14,3 LUFS, TP −1,4, max short-term +3,4 LU), deliver PASS, legal final đạt | V11-B dùng bản 2 |
| G4k | V11-B bản 3 `video-src/v11b3-da-mat` (owner 20/10: PlanGo xuất hiện ở giây 4 chưa đủ hoành tráng): logo đập vào + vệt sáng + bay vào góc; bản 2 `v11b2-da-mat` giữ để so sánh. Owner 20/10 chọn bản 3 và yêu cầu làm thêm 16:9 + 4:5 (bố cục riêng từng tỉ lệ; 9:16 đã duyệt sao lưu ở `_approved_9x16/`) | DONE | 3 tỉ lệ QA PASS (−14,3 LUFS, TP −1,6, phone_sim 3,7), deliver PASS (social 9:16 11,1 MB · 16:9 11,9 MB · 4:5 11,1 MB), legal final đạt | DONE: owner 20/10 duyệt cả 3 tỉ lệ |
| G5 | Dựng trang S01–S11 + Pricing/Estimator/VideoSlot, SEO, llms, form gói | REVIEW | build OK; `npm run verify` exit 0; `verify:landing` PASS; check 0 lỗi; soát 1440/768/375 px | Owner duyệt bản dựng |
| G6 | QA / SEO / lead test thật | PARTIAL | verify, verify:landing, verify:links (0 gãy), check 0 lỗi; mobile 375 không tràn; tải lần đầu mobile ~50 KB gzip; privacy/terms cập nhật KORUS 19/10 | Test lead thật sau khi có Sheet (B-01) |
| G7 | Deploy Vercel + DNS, bật `indexable` | PARTIAL | plango.korus.vn đã chạy (200); 19/10 bật `indexable: true` (D-14) — robots có Sitemap, sitemap 3 URL, thank-you vẫn noindex | Owner gửi sitemap lên Google Search Console; xác nhận GTM ID trên Vercel |

Critical path: owner duyệt bản dựng → B-01 hạ tầng → G6 lead test → G7.

## Decisions, blockers

| ID | Loại | Nội dung | Nguồn |
|---|---|---|---|
| D-01 | Decision | Khung giá 3 gói + Doanh nghiệp theo §5 kế hoạch | Owner 19/10/2026 |
| D-02 | Default | Hiển thị "từ … triệu/tháng" (theo D-07); không nêu tên Hưng Nhân; CTA "Đặt lịch demo"; không quảng cáo dùng thử | Kế hoạch §8 |
| D-03 | Decision | 4 lợi ích định tính gắn cơ chế; số liệu chờ đo thí điểm G9 | Owner 19/10/2026 |
| D-04 | Decision | Repo chỉ chứa landing | Owner 19/10/2026 |
| D-05 | Decision | Landing không sản xuất video; giữ `video-src/` làm dự phòng | Owner 19/10/2026 |
| D-07 | Decision | Phí thuê bao theo THÁNG: Cơ bản từ 3, Tiêu chuẩn từ 5, Nâng cao từ 9 triệu/tháng (thay khung phí năm) | Owner 19/10/2026 |
| D-08 | Decision | Lead dùng Google Sheet + Apps Script như landing1 nhưng FILE SHEET RIÊNG cho PlanGo (`docs/HUONG_DAN_LEAD_SHEET.md`, script `plango-2026-10-19`) | Owner 19/10/2026 |
| D-09 | Tech | Form + popup luôn hiển thị; thiếu cấu hình lead thì bấm gửi hiện hotline/Zalo (cờ `data-lead-enabled`) | 19/10/2026 |
| D-06 | Tech | Trường lead `application` = gói quan tâm; quy mô ghi trong `message` (không đổi schema Sheet) | 19/10/2026 |
| B-01 | Blocker (G6/G7) | Owner tạo Sheet PlanGo + deploy Apps Script + đặt biến Vercel theo `docs/HUONG_DAN_LEAD_SHEET.md`; DNS plango.korus.vn; GTM ID | Owner |
| D-10 | Decision | Owner 19/10/2026 giao session landing dựng video V5 trong `video-src/` (bổ sung D-05; `../marketing-video/` vẫn chỉ đọc) | Owner chat 19/10/2026 |
| O-02 | Resolved 19/10 | Đã đánh giá + áp dụng phần hợp lý (`docs/DANH-GIA-DE-XUAT-TRUYEN-THONG.md`); không áp dụng S04 5 nhịp và 2 trường form. Đề xuất gốc §4.15 (section mới S01c/S04c, S04 5 nhịp, câu "không cần ERP", câu tăng ca, 2 trường form) và đổi tên 3 video S09 theo bản v3.1 đã giao | Owner |
| D-11 | Decision | Form thêm Tỉnh/Thành (34 đơn vị từ 01/07/2025, `src/content/vn-provinces.ts`, không bắt buộc, dưới Số điện thoại); Apps Script `plango-2026-10-19.4` thêm cột (themCotThieu chạy tay) | Owner 19/10/2026 |
| D-14 | Decision | Lighthouse SEO thấp do `noindex,nofollow` trên domain thật → bật `indexable`; thẻ Twitter đổi sang `name=` (audit sb-ads-tracking-seo-standard) | Owner 19/10/2026 |
| O-03 | Open | Tracking dùng mô hình opt-out (đo ngay, cho phép từ chối; đã nêu ở /privacy). Owner/pháp chế xác nhận phù hợp Nghị định 13/2023 & Luật BVDLCN, hoặc chuyển sang opt-in | Owner |
| D-13 | Decision | Bỏ phần video khỏi landing (hero dùng ảnh tĩnh, bỏ demo S04 và S09); file giữ ở `media-archive/`, không xoá | Owner 19/10/2026 |
| D-12 | Fix | Nút "Cài đặt cookie": khi chưa bật tracking mở hộp thông báo (`SiteFooter`); có tracking mở banner như cũ | 19/10/2026 |
| D-15 | Decision | Mở CSP cho Google Ads (Conversion, Remarketing, Conversion Linker qua GTM) theo `dev-brief-261125-0943-csp-google-ads-plango-website.md`: `connect-src` +7, `img-src` +4, `script-src` +3 origin (gồm `www.google.com`), `frame-src` không đổi; không mở GTM Preview. Sửa ở `astro.config.mjs`, `ORIGIN_POLICY`, `verify-runtime-tracking-activation.mjs`. Kiểm local 25/11: verify exit 0, build + verify:landing + verify:links exit 0, header 11 route khớp brief. CHƯA commit/deploy; sau deploy: curl header, Console, Tag Assistant, báo marketing gửi lead thử | Owner chat 25/11/2026 |
| O-04 | Open | `/privacy` dòng Google mới ghi "lưu thông tin biểu mẫu và đo lường truy cập", chưa nêu đo hiệu quả quảng cáo/remarketing Google Ads. Owner duyệt câu chữ (liên quan O-03) rồi chạy `npm run legal` | Owner |
| O-01 | Open | §8.2–8.7: mua đứt, chi phí AI, dịch vụ demo, nhắc Hưng Nhân, khóa gói trong license | Owner |

## Next actions

1. Owner xem bản dựng (`SITE_PROFILE=landing-plango npm run build`, phục vụ `.vercel/output/static`) và duyệt hình/bố cục.
2. Video tạm ngưng (D-13); chỉ bật lại khi owner yêu cầu.
3. Owner cung cấp hạ tầng B-01 → G6 test lead thật → G7.

## Ghi chú kỹ thuật

- Thêm origin CSP phải sửa 3 nơi (RUNBOOK_TRIEN_KHAI mục 5); không viết ký tự `*` trong `astro.config.mjs` kể cả comment.
- `sb-test.config.json` (tạo 25/11): cheap `verify` = `npm run verify`; suite batch `build` = build + verify:landing + verify:links. Máy này không có `node` trên PATH, dùng `%LOCALAPPDATA%\nvm\v24.18.0`.

- Verifier kế thừa đã sửa: regex CSP thiếu origin CAPI (`verify-runtime-tracking-activation.mjs`).
- `verify-landing-output.mjs` viết lại cho PlanGo (lợi ích, AggregateOffer = giá hiển thị, FAQ/llms, không còn thương hiệu framework).
- Bài học mobile 19/10: bảng `min-width` (kể cả trong khung cuộn) và lớp `blur` làm Chrome mobile thu nhỏ trang → bảng ma trận co theo màn hình dưới `sm`.
- Ảnh: `design-src/render.mjs` chụp 2x (RENDER_SCALE), srcset tới 2560/3200w, AVIF quality 80.
- Favicon: logo tròn KORUS (`brand_identity/derived/korus-mark.png`) → `node design-src/favicon.mjs`; favicon VN-J cũ lưu `docs/_framework-origin/favicon-vnj/`.
- Legal gate: `scripts/legal/` (kv-legal lexicon 1.7.1), chạy trong `npm run verify`.
- Profile `indexable: false` tới G7 (sitemap rỗng có chủ đích).
