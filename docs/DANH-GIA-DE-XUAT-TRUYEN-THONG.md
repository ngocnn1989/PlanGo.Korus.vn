# Đánh giá đề xuất chỉnh lý landing (DE-XUAT-TRUYEN-THONG-PLANGO.md §4)

- Ngày: 19/10/2026 · Người đánh giá: Claude (session landing) · Trạng thái: **đã áp dụng phần chấp nhận** (chờ owner xem bản dựng)
- Cách đánh giá: mỗi mục đối chiếu với mã nguồn sản phẩm (`planner-core/`) và quy tắc nội dung của `rule.md`. Claim mới được thêm vào `src/content/plango-product.ts` (f9–f14) kèm nguồn.

## Kết quả kiểm chứng tính năng mà đề xuất muốn đưa lên trang

| Mã | Đề xuất nói | Mã nguồn thực tế | Kết luận |
|---|---|---|---|
| T2 | Cảnh báo thiếu sẵn sàng NPL/vải/mẫu | `workshop_optimizer._candidate_start = max(ngày chuyền trống, ngày NPL về)`; `draft_candidate_audit` báo `start_before_material_ready` | **Đúng, còn mạnh hơn**: đơn không được xếp bắt đầu trước ngày vải, phụ liệu, tài liệu mẫu sẵn sàng → claim f10 |
| T4 | "Ưu tiên một đơn một chuyền; chỉ chia chuyền khi không kịp; tăng ca ngắn cuối đơn trong giới hạn giờ" | `_first_single_line` chỉ ở hướng A (`minimal_disruption`); `_tail_overtime` chỉ ở hướng C (`deadline_recovery`), `max_overtime_hours` mặc định 4; các hướng khác thử chia tới 4 chuyền và trừ điểm tách đơn | **Nói quá** nếu viết chung cho mọi phương án → viết lại theo từng hướng (f14) |
| T5 | Lao động theo ngày | README "shared line/day labor"; operator-guide | Đúng → f13 |
| T6 | Lịch làm việc, ngày nghỉ | `calendar/working_calendar.py` | Đúng → f9 |
| T8 | Ngày nhả chuyền tự tính; chuyền thiếu dữ liệu khoá nhận đơn | `line_running_load` (release date, `blocked_lines`) | Đúng → f11 |
| T16 | Cập nhật có sao lưu | end-user guide "Khi được cấp bản mới" | Đúng → f12 |

## Quyết định theo từng mục

| Mục | Quyết định | Lý do / điều chỉnh |
|---|---|---|
| 4.1 Hero | **Chấp nhận, có sửa** | Mở bằng tình huống (đơn gấp, thiếu người, khách hỏi ngày giao) — đúng nỗi đau. Giữ câu lợi ích owner yêu cầu ("rút ngắn thời gian lập kế hoạch, tận dụng công suất"), bỏ câu "Bạn chọn, hệ thống lưu" để hero không dài thêm. Dòng phụ thêm "Giữ Excel quen thuộc". |
| 4.2 S01c Dành cho ai | **Chấp nhận** | Bốn vai trò rõ ràng, giúp người mua (P2) thấy cả tổ chức dùng được. Đặt ngay sau phần lợi ích, dạng thẻ ngắn. |
| 4.3 S02 4 nỗi đau | **Chấp nhận** | Cụ thể hơn bản cũ ("số liệu lệch", "tính tay"); khớp tình huống mua §2.4. |
| 4.4 S03 thêm 2 dòng | **Chấp nhận, sửa câu chữ** | Dòng NPL viết theo đúng cơ chế (f10) thay vì "cảnh báo thiếu sẵn sàng" (dễ hiểu nhầm là theo dõi kho). |
| 4.5 S04 thành 5 nhịp | **Không chấp nhận** | (1) Thông điệp chính là "ba bước, ngay trong khung chat" — 5 nhịp làm loãng sự đơn giản, đúng nỗi sợ "phần mềm phức tạp" của P1. (2) Ba bước hiện có ảnh minh họa riêng; hai nhịp thêm (theo dõi, cập nhật) không có hình và trùng với S04c + S05 "Theo dõi". Phần vận hành hằng ngày đã được bù bằng S04c. |
| 4.6 Câu tăng ca | **Chấp nhận, viết lại cho đúng mã** | Xem T4: nêu theo hướng A / hướng C, không khái quát cho mọi phương án. Không nêu số "4 giờ" trên trang (là mặc định cấu hình, nhà máy đặt được). |
| 4.7 S04c Khi xưởng có biến động | **Chấp nhận** | Phần mạnh nhất của đề xuất: trả lời đúng câu hỏi "khi có sự cố thì sao". Câu chữ từng thẻ gắn claim (s3, s6, f13, f10, f4, s1, f11). |
| 4.8 S05 gom 3 nhóm | **Chấp nhận** | Lập kế hoạch / Theo dõi / Báo cáo, mỗi nhóm 4 mục; thêm f9, f10, f11, f13. Mục "cập nhật có sao lưu" đặt ở S06 (an toàn), không lặp ở S05. |
| 4.9 S06 thêm thẻ | **Chấp nhận** | "Nâng cấp không mất dữ liệu" (f12). |
| 4.10 S07/S08 | Giữ | S08 đã có câu "dùng chính file Excel nhà máy đang có". |
| 4.11 S09 video | **Chấp nhận** | Tên video đổi theo bản v3.1 đã giao; ba video được encode bản web 720p H.264 (1,0–1,5 MB, faststart) vào `public/media/` từ `_social.mp4` — `marketing-video/` không bị sửa. |
| 4.12 FAQ +4 | **Chấp nhận, sửa 1 câu** | Câu "Nhà máy chưa có ERP…": bản đề xuất ghi "không cần hệ thống khác" — chưa đúng vì vẫn cần máy tính Windows và tài khoản trợ lý AI (FAQ "Cần máy tính và phần mềm gì?"). Đã sửa cho đủ điều kiện. |
| 4.13 Form thêm "Đang lập kế hoạch bằng" + "Vai trò" | **Không chấp nhận** | Mỗi trường thêm làm giảm tỉ lệ gửi form; owner vừa thêm "Tỉnh/Thành". Hai thông tin này hỏi được trong cuộc gọi đầu (bước Khảo sát) — chính xác hơn tự khai. Nếu cần đo, dùng trường ẩn UTM/nguồn quảng cáo thay vì hỏi khách. |
| 4.14 SEO description | **Chấp nhận, rút gọn** | Bản đề xuất ~190 ký tự, Google cắt ~155–160. Bản dùng: 138 ký tự. |

## Lưu ý thêm cho tài liệu đề xuất (không ảnh hưởng landing)

- §2.2 "Địa bàn gợi ý" dùng tên tỉnh cũ (Nam Định, Thái Bình, Hải Dương, Bắc Giang, Bình Dương, Long An). Từ 01/07/2025 nên ghi theo tên mới (Ninh Bình, Hưng Yên, Hải Phòng, Bắc Ninh, TP. Hồ Chí Minh, Tây Ninh) khi chạy quảng cáo theo vị trí.
- §2.1 các số liệu thị trường (3.800 nhà máy, 46 tỷ USD) chỉ dùng cho định hướng nội bộ; không đưa lên landing (quy tắc không đăng số liệu không thuộc sản phẩm).
