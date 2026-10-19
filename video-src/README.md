# Video dự phòng cho landing PlanGo

Trạng thái: **DỰ PHÒNG — chưa sản xuất** (owner 19/10/2026: video chính do session *Dự án hungnhan-garment* làm; giữ thư mục này để dùng khi cần).

| Thư mục | Nội dung dự kiến | Khởi tạo |
|---|---|---|
| `v4-hero-loop/` | Hero loop 12–16 s, 16:9 + 4:5, không âm, lặp mượt | `kv.mjs init --name PlanGo_Hero_Loop --fps 30` |
| `v5-chat-demo/` | Demo "Lập kế hoạch bằng chat" 30 s, 16:9 | `kv.mjs init --name PlanGo_Chat_Demo --template demo_proof --len 30` |

- Bộ công cụ: kr-motion-video (storyboard KV). Khi kích hoạt: sửa `storyboard.js`, chạy `node kv.mjs make --until stills`, rồi `make` + `deliver`.
- Chỉ dùng claim trong `src/content/plango-product.ts`; legal gate bắt buộc.
- File web đưa vào `public/media/` theo tên trong `docs/VIDEO_HANDOFF.md`.
- Ghi chú: thư mục khung ban đầu bị xóa nhầm ngày 19/10/2026 và đã được khởi tạo lại bằng cùng lệnh `kv.mjs init`.
