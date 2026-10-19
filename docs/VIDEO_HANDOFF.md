# Giao video cho landing PlanGo

> **Tạm ngưng (owner 19/10/2026, D-13):** landing đã bỏ toàn bộ video (hero, demo S04, S09). Ba video v3.1 bản web được giữ dự phòng ở `media-archive/` (ngoài `public/`, không deploy). Component `VideoSlot.astro` vẫn còn nhưng không được trang nào dùng. Muốn bật lại: chuyển file về `public/media/` và gắn lại khe trong `src/pages/index.astro` (xem commit bỏ video để khôi phục).

Video do session **Dự án hungnhan-garment** sản xuất (`HUNG-NHAN/marketing-video/`). Landing chỉ nhúng file đã giao; không sửa thư mục nguồn video. Khung dự phòng nội bộ: `video-src/` (chưa dùng).

Đặt file vào `public/media/` đúng tên dưới đây rồi build lại. Component `src/components/plango/VideoSlot.astro` tự nhận file lúc build; thiếu file thì trang dùng ảnh tĩnh, không lỗi.

| Khe trên trang | File video | Poster (khung đầu) | Yêu cầu |
|---|---|---|---|
| Hero (S01), nền tự chạy, tắt tiếng | `plango-hero-16x9.mp4` | `plango-hero-16x9.jpg` | H.264 yuv420p, `-movflags +faststart`, không cần âm thanh, lặp mượt, ≤ 4 MB |
| Cách hoạt động (S04) | `plango-demo-16x9.mp4` | `plango-demo-16x9.jpg` | H.264 + AAC, faststart, ≤ 6 MB |
| Video ngắn (S09) — V1 "23:55 — Khách hỏi ngày giao" | `plango-v1-9x16.mp4` | `plango-v1-9x16.jpg` | H.264 + AAC, 9:16, ≤ 4 MB |
| Video ngắn (S09) — V2 "Một đơn gấp" | `plango-v2-9x16.mp4` | `plango-v2-9x16.jpg` | như trên |
| Video ngắn (S09) — V3 "Trợ lý AI của phòng kế hoạch" | `plango-v3-9x16.mp4` | `plango-v3-9x16.jpg` | như trên |

- 19/10/2026: V1–V3 (bản v3.1: 23:55 · Một đơn gấp · Trợ lý AI) đã đưa vào `public/media/` — encode web từ `_social.mp4`: `-vf scale=720:-2 -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart` (1,0–1,5 MB/video); poster lấy `*_cover.jpg` hoặc khung 1,5 s.
- Dùng bản `_social.mp4` (H.264) của kr-motion-video; bản `_small.mp4` là HEVC, một số trình duyệt không phát được.
- Poster: JPEG ≤ 150 KB.
- Section S09 chỉ hiện khi có ít nhất một video V1–V3.
- Sau khi thêm file: `SITE_PROFILE=landing-plango npm run build`, kiểm tra trên bản preview, rồi commit.
