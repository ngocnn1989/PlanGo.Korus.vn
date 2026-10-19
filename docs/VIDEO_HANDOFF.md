# Giao video cho landing PlanGo

Video do session **Dự án hungnhan-garment** sản xuất (`HUNG-NHAN/marketing-video/`). Landing chỉ nhúng file đã giao; không sửa thư mục nguồn video. Khung dự phòng nội bộ: `video-src/` (chưa dùng).

Đặt file vào `public/media/` đúng tên dưới đây rồi build lại. Component `src/components/plango/VideoSlot.astro` tự nhận file lúc build; thiếu file thì trang dùng ảnh tĩnh, không lỗi.

| Khe trên trang | File video | Poster (khung đầu) | Yêu cầu |
|---|---|---|---|
| Hero (S01), nền tự chạy, tắt tiếng | `plango-hero-16x9.mp4` | `plango-hero-16x9.jpg` | H.264 yuv420p, `-movflags +faststart`, không cần âm thanh, lặp mượt, ≤ 4 MB |
| Cách hoạt động (S04) | `plango-demo-16x9.mp4` | `plango-demo-16x9.jpg` | H.264 + AAC, faststart, ≤ 6 MB |
| Video ngắn (S09) — V1 "Rải rác nhiều file" | `plango-v1-9x16.mp4` | `plango-v1-9x16.jpg` | H.264 + AAC, 9:16, ≤ 4 MB |
| Video ngắn (S09) — V2 "Lập kế hoạch bằng chat" | `plango-v2-9x16.mp4` | `plango-v2-9x16.jpg` | như trên |
| Video ngắn (S09) — V3 "Cách cũ · Cách mới" | `plango-v3-9x16.mp4` | `plango-v3-9x16.jpg` | như trên |

- Dùng bản `_social.mp4` (H.264) của kr-motion-video; bản `_small.mp4` là HEVC, một số trình duyệt không phát được.
- Poster: JPEG ≤ 150 KB.
- Section S09 chỉ hiện khi có ít nhất một video V1–V3.
- Sau khi thêm file: `SITE_PROFILE=landing-plango npm run build`, kiểm tra trên bản preview, rồi commit.
