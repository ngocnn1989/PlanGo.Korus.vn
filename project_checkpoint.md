# Project Checkpoint — PlanGo Landing

- Project/root: `HUNG-NHAN/PlanGo`
- Updated at/owner/trigger: `2026-10-19` / Claude (Direct mode) / G3 + G5 hoàn thành, chờ owner duyệt bản dựng
- Freshness: `current`
- Overall state: `on_track`

## Authority

1. Rule: `rule.md`
2. Plan: `KE-HOACH-LANDING-PLANGO.md` (PLANGO-LP-01 r3, APPROVED 19/10/2026)
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
| G4 | Video | ĐỔI CHỦ | Owner 19/10: session hungnhan-garment sản xuất; landing có khe nhúng (`docs/VIDEO_HANDOFF.md`); khung dự phòng `video-src/` | Nhận file vào `public/media/` |
| G5 | Dựng trang S01–S11 + Pricing/Estimator/VideoSlot, SEO, llms, form gói | REVIEW | build OK; `npm run verify` exit 0; `verify:landing` PASS; check 0 lỗi; soát 1440/768/375 px | Owner duyệt bản dựng |
| G6 | QA / SEO / lead test thật | PENDING | — | cần biến môi trường lead |
| G7 | Deploy Vercel + DNS, bật `indexable` | PENDING | — | B-01 |

Critical path: owner duyệt bản dựng → B-01 hạ tầng → G6 lead test → G7.

## Decisions, blockers

| ID | Loại | Nội dung | Nguồn |
|---|---|---|---|
| D-01 | Decision | Khung giá 3 gói + Doanh nghiệp theo §5 kế hoạch | Owner 19/10/2026 |
| D-02 | Default | Hiển thị "từ … triệu/năm"; không nêu tên Hưng Nhân; CTA "Đặt lịch demo"; không quảng cáo dùng thử | Kế hoạch §8 |
| D-03 | Decision | 4 lợi ích định tính gắn cơ chế; số liệu chờ đo thí điểm G9 | Owner 19/10/2026 |
| D-04 | Decision | Repo chỉ chứa landing | Owner 19/10/2026 |
| D-05 | Decision | Landing không sản xuất video; giữ `video-src/` làm dự phòng | Owner 19/10/2026 |
| D-06 | Tech | Trường lead `application` = gói quan tâm; quy mô ghi trong `message` (không đổi schema Sheet) | 19/10/2026 |
| B-01 | Blocker (G7) | Cần Vercel, DNS plango.korus.vn, Google Sheet/Apps Script, GTM ID | Owner |
| O-01 | Open | §8.2–8.7: mua đứt, chi phí AI, dịch vụ demo, nhắc Hưng Nhân, khóa gói trong license | Owner |

## Next actions

1. Owner xem bản dựng (`SITE_PROFILE=landing-plango npm run build`, phục vụ `.vercel/output/static`) và duyệt hình/bố cục.
2. Khi session video giao file: đặt vào `public/media/` theo `docs/VIDEO_HANDOFF.md`, build, commit.
3. Owner cung cấp hạ tầng B-01 → G6 test lead thật → G7.

## Ghi chú kỹ thuật

- Verifier kế thừa đã sửa: regex CSP thiếu origin CAPI (`verify-runtime-tracking-activation.mjs`).
- `verify-landing-output.mjs` viết lại cho PlanGo (lợi ích, AggregateOffer = giá hiển thị, FAQ/llms, không còn thương hiệu framework).
- Bài học mobile 19/10: bảng `min-width` (kể cả trong khung cuộn) và lớp `blur` làm Chrome mobile thu nhỏ trang → bảng ma trận co theo màn hình dưới `sm`.
- Legal gate: `scripts/legal/` (kv-legal lexicon 1.7.1), chạy trong `npm run verify`.
- Profile `indexable: false` tới G7 (sitemap rỗng có chủ đích).
