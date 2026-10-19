# Project Rule — PlanGo Landing

This is the canonical project-global rule file for the PlanGo landing (`HUNG-NHAN/PlanGo`). It applies to every agent session and every task performed within this folder.

## Session Gate

- At the start of each task, read this file, then root-level `project_checkpoint.md`, before planning, using tools, editing files, or reporting results.
- Keep `project_checkpoint.md` synchronized with the active plan, decisions, blockers, evidence, and next actions; refresh it before handoff, context compaction, unfinished session end, and closure.
- Update this file when a project-wide rule changes; do not create competing project-global rule files.
- Parent project rule `../rule.md` (Hưng Nhân Garment Planner) still governs product source; this landing never edits `../planner-core`, `../dashboard` or `../marketing-video`.

## Authority

- Kế hoạch đang thực thi: `KE-HOACH-LANDING-PLANGO.md` (PLANGO-LP-01 r2, APPROVED 19/10/2026).
- Nguồn dữ kiện sản phẩm (claims): `src/content/plango-product.ts`, đối chiếu `docs/plango_product_facts.md`.
- Bảng giá/gói: `src/content/plango-pricing.ts` (khung giá owner duyệt 19/10/2026).
- Copy toàn trang: `src/content/plango-copy.ts`, bản duyệt `docs/plango_landing_copy.md`.
- Framework nền: sao chép từ `C:\Data\1.Projects\Landing\landing1` commit `6838630` (korus-web-framework). Handbook kỹ thuật: `docs/WEB_DEPLOYMENT_HANDBOOK.md`, triển khai: `docs/RUNBOOK_TRIEN_KHAI.md`, ảnh: `docs/SPEC_ANH_THIET_KE.md`.

## Quy tắc nội dung (bắt buộc)

- Chỉ đăng claim có mã nguồn trong `plango-product.ts`. Không số liệu hiệu quả, testimonial, logo/tên khách hàng (kể cả Hưng Nhân) khi chưa có chấp thuận bằng văn bản.
- Không từ ngữ tuyệt đối/cam kết/ưu đãi: "nhất", "số 1", "hàng đầu", "duy nhất", "cam kết", "miễn phí", "trọn đời", "100%", "best". Giá chỉ ghi bằng VNĐ.
- Giao diện trong ảnh/video là dữ liệu demo và phải ghi chú "dữ liệu minh họa" khi có thể gây hiểu nhầm.
- Chạy legal gate (`npm run legal`, bản sao `scripts/legal/` từ kr-motion-video lexicon 1.7.1) sau mọi thay đổi copy; `npm run verify` đã gồm bước này.

## Ràng buộc kỹ thuật (kế thừa từ framework)

- Profile: `src/config/profiles/landing-plango.json`. `SITE_PROFILE` phải là biến môi trường thật (đặt trong `.env` không có tác dụng). Build local: `SITE_PROFILE=landing-plango npm run build`.
- Màu thương hiệu lấy từ `theme_tokens` trong profile; khối `@theme` trong `global.css` chỉ là hạt giống cho Tailwind.
- `canonical_origin` thuần SEO; form lead sống/chết do `LEAD_ALLOWED_ORIGINS` (đúng một origin https, primary domain). Đổi biến môi trường phải redeploy và gửi thử một lead thật.
- `src/styles/font-vietnamese-priority.css` phải import SAU `@fontsource/mulish`.
- Không thêm `unsafe-inline` vào `script-src`; cần origin mới thì mở rộng `ORIGIN_POLICY` trong `scripts/normalize-vercel-csp-routes.mjs`.
- Typecheck (`npm run check`) 0 lỗi; chạy `npm run verify` trước khi commit/deploy, `npm run verify:landing` sau build.
- `indexable: false` cho tới khi owner duyệt bản preview và DNS `plango.korus.vn` đã trỏ (G7).
