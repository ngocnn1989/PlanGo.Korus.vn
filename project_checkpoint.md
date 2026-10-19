# Project Checkpoint — PlanGo Landing

- Project/root: `HUNG-NHAN/PlanGo`
- Updated at/owner/trigger: `2026-10-19` / Claude (Direct mode) / G1 DONE, G2 chờ owner duyệt copy
- Freshness: `current`
- Overall state: `on_track`

## Authority

1. Rule: `rule.md`
2. Plan: `KE-HOACH-LANDING-PLANGO.md` (PLANGO-LP-01 r2, APPROVED 19/10/2026)
3. Board: Direct mode (không board)
4. Framework source: `Landing/landing1` commit `6838630`

## Gantt / trạng thái giai đoạn

| GĐ | Nội dung | Trạng thái | Bằng chứng | Bước tiếp |
|---|---|---|---|---|
| G0 | Owner duyệt kế hoạch + khung giá | DONE | Owner chat 19/10/2026 | — |
| G1 | Bootstrap framework, profile `landing-plango`, git remote | DONE | check 0 lỗi; build OK; `npm run verify` exit 0 (19/10) | — |
| G2 | Copy, product facts (b1–b4, s1–s7, f1–f8), pricing data | REVIEW | `docs/plango_landing_copy.md`; `npm run legal` đạt; check 0 lỗi | Owner duyệt copy + 5 câu hỏi §3 |
| G3 | Ảnh kr-design D1–D9 | PENDING | — | sau G2 |
| G4 | Video V4/V5 + nhận V1–V3 | PENDING | — | song song G3 |
| G5 | Dựng trang S01–S11 | PENDING | — | sau G2–G3 |
| G6 | QA / SEO / lead test | PENDING | — | — |
| G7 | Deploy Vercel + DNS | PENDING | — | cần hạ tầng owner |

Critical path: G2 (owner duyệt copy) → G5 → G6 → G7.

## Decisions, blockers

| ID | Loại | Nội dung | Nguồn |
|---|---|---|---|
| D-01 | Decision | Khung giá 3 gói + Doanh nghiệp theo §5 kế hoạch | Owner 19/10/2026 |
| D-03 | Decision | Landing nêu 4 lợi ích (rút ngắn thời gian lập KH, tối ưu lịch, tận dụng công suất chuyền, nâng năng suất) — định tính, gắn cơ chế; số liệu chờ đo thí điểm G9 | Owner 19/10/2026 |
| D-04 | Decision | Repo `ngocnn1989/PlanGo.Korus.vn` chỉ chứa landing (thư mục PlanGo); remote đã gắn, chưa commit/push | Owner 19/10/2026 |
| D-02 | Default | Hiển thị "từ … triệu/năm"; không nêu tên Hưng Nhân; CTA "Đặt lịch demo"; không quảng cáo dùng thử | Kế hoạch §8 (mặc định tới khi owner chốt) |
| B-01 | Blocker (G7) | Cần Vercel, DNS plango.korus.vn, Google Sheet/Apps Script, GTM ID | Owner |
| O-01 | Open | §8.2–8.7: mua đứt, chi phí AI, dịch vụ demo, nhắc Hưng Nhân, khóa gói trong license | Owner |

## Next actions

1. Owner duyệt copy (`docs/plango_landing_copy.md` §3).
2. Sau duyệt: G3 ảnh kr-design + G4 video V4/V5 song song, rồi G5 dựng trang.
3. Owner xác nhận commit + push lần đầu lên repo.

## Ghi chú kỹ thuật

- Sửa verifier kế thừa: `scripts/verify-runtime-tracking-activation.mjs` regex CSP thiếu origin CAPI (lệch có sẵn ở landing1 `6838630`).
- Legal gate: `scripts/legal/` (kv-legal lexicon 1.7.1), chạy trong `npm run verify`.
- Profile `indexable: false` tới G7.
