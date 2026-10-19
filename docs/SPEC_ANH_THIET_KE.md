# Spec ảnh — Landing page Novabot Robotics

**Cập nhật:** 2026-09-10 · **Trang:** https://weldbot.tech
**Người nhận:** designer / bộ phận thiết kế

Kích thước dưới đây được đo từ layout thật của trang, không phải ước lượng.
Bố cục: nội dung rộng tối đa **1226 px**, lưới sản phẩm 3 cột, khoảng cách cột 40 px.

---

## Bảng kích thước

| # | Vị trí | Kích thước giao nộp | Tỷ lệ | Cách hiển thị | Dung lượng tối đa | Nền |
|---|---|---|---|---|---|---|
| **A** | Ảnh nền Hero (đầu trang) | **1920 × 1080** | 16:9 | Phủ kín, cắt tràn viền | 200 KB | Ảnh chụp, sẽ bị phủ lớp tối 70% |
| **B** | Ảnh khối "Tại sao chọn Novabot" | **1200 × 900** | 4:3 | Phủ kín khung bo góc | 120 KB | Ảnh chụp |
| **C** | 3 ảnh card sản phẩm | **960 × 720** | 4:3 | Vừa khít, không cắt | 60 KB / ảnh | Nền sáng, xem mục "Nền ảnh sản phẩm" |
| **D** | Ảnh khối "Hỗ trợ vận hành ổn định" | **1200 × 900** | 4:3 | Vừa khít, không cắt | 120 KB | Như C |

Tổng dung lượng ảnh toàn trang nên **dưới 500 KB**.

---

## Giải thích cách hiển thị

**"Phủ kín, cắt tràn viền"** (A, B) — ảnh bị cắt để lấp đầy khung. Chủ thể phải nằm ở **giữa khung**, chừa lề an toàn 15% mỗi phía vì phần rìa có thể bị cắt trên màn hình tỷ lệ khác.

**"Vừa khít, không cắt"** (C, D) — toàn bộ ảnh luôn hiển thị, phần thừa của khung sẽ là nền. Vì vậy nền ảnh phải hoà với nền trang.

---

## Nền ảnh sản phẩm (C và D)

Ba ảnh card đặt cạnh nhau nên **phải đồng bộ tuyệt đối**: cùng hướng nhìn, cùng tỷ lệ chiếm khung, cùng nền, cùng ánh sáng. Lệch một ảnh là thấy ngay.

- Nền: gradient rất nhẹ từ trắng `#FFFFFF` (trên) xuống xám lạnh `#E6EBF1` (dưới), hoặc trắng phẳng.
- Bóng đổ mềm dưới chân sản phẩm, không viền cứng, không khung hộp.
- Sản phẩm chiếm **75–80% chiều rộng khung**, căn giữa, chừa lề thoáng đều.
- Không đổ bóng lệch hướng khác nhau giữa 3 ảnh.

---

## Ba sản phẩm cần ảnh

| Tên file | Sản phẩm | Ghi chú nội dung |
|---|---|---|
| `robot-han-8-truc.jpg` | Robot hàn tự động 8 trục | Hệ thống lớn có ray và dầm ngang. Cần thấy được quy mô. |
| `robot-han-7-truc.jpg` | Robot hàn tự động 7 trục | Cánh tay chạy trên ray dài, thấy rõ ray và xích cáp. |
| `robot-han-6-truc-rh14.jpg` | Robot hàn 6 trục TEC-RH14-10-W | Cánh tay đơn cỡ nhỏ trong trạm hàn có bàn gá và rèm chắn hồ quang. |

---

## Yêu cầu bắt buộc

**Không được có:**
- Watermark, logo nhà cung cấp, dấu bản quyền
- Chữ nung sẵn trong ảnh (tiêu đề, thông số, giá) — chữ do web render để đọc được và dịch được
- Khung viền, nền đen, ảnh chụp màn hình catalogue
- Ảnh phóng to từ ảnh nhỏ. Ảnh gốc phải **bằng hoặc lớn hơn** kích thước giao nộp

**Bắt buộc có:**
- Định dạng **JPEG** chất lượng 80–85, hoặc **PNG** nếu nền trong suốt (web sẽ tự chuyển đổi)
- Không gian màu **sRGB**
- Tên file viết thường, không dấu, ngăn bằng gạch ngang, đúng như bảng trên

---

## Màu thương hiệu để tham chiếu

| Vai trò | Mã màu |
|---|---|
| Chính (CTA, nhấn) | `#C2410C` |
| Chính đậm (hover) | `#9A3412` |
| Chữ tiêu đề | `#111827` |
| Chữ nội dung | `#4B5563` |
| Nền sáng | `#FFFFFF` |

Màu chính đã được chọn để đạt tương phản WCAG AA với chữ trắng (5,2:1). Nếu ảnh có chi tiết màu cam, tránh dùng sắc cam sáng hơn `#C2410C` để không lấn át nút bấm.

---

## Nếu giao được ảnh lớn hơn

Web có thể tự sinh nhiều kích thước cho từng loại màn hình. Nếu có ảnh gốc độ phân giải cao, **cứ gửi bản lớn nhất** — kèm theo bản đúng kích thước ở bảng trên. Bên kỹ thuật sẽ xử lý phần tối ưu.

Ưu tiên **ảnh chụp thực tế tại xưởng** hơn ảnh render. Trong quảng cáo B2B công nghiệp, ảnh máy đang chạy thật thuyết phục hơn hẳn ảnh render nền trắng.

---

## Ảnh đang dùng (cập nhật 07/09/2026)

Bộ render nền trắng đã được thay bằng ảnh chụp xưởng, tất cả 1200 × 900, nguồn nằm trong `src/assets/images/thuc-te/`.

| Vị trí | File trong `src/assets/` | Ảnh nguồn |
|---|---|---|
| Hero + nền khối CTA cuối | `hero-han-dam-thep.jpg` | `robot-7-truc/04-han-goc-dam-thep.jpg` |
| Panel phải khối hero | `mo-han-do-duong-han.jpg` | `robot-8-truc/02-mo-han-va-do-duong-han.jpg` |
| Card sản phẩm 8 trục | `robot-han-8-truc.jpg` | `robot-8-truc/01-toan-canh-xuong.jpg` |
| Card sản phẩm 7 trục | `robot-han-7-truc.jpg` | `robot-7-truc/01-toan-canh-ray-12m.jpg` |
| Card sản phẩm 6 trục | `robot-han-6-truc-rh14.jpg` | `robot-6-truc/01-toan-canh-tram-han.jpg` |
| Khối "Hỗ trợ vận hành ổn định" | `camera-3d-do-duong-han.jpg` | `robot-7-truc/02-camera-laser-3d.jpg` |

Ba card sản phẩm đã chuyển từ `object-contain` sang `object-cover`: ảnh chụp tràn khung nên không còn cần chừa nền trắng như bộ render cũ.

Chín ảnh còn lại trong `thuc-te/` chưa dùng tới, giữ làm dự trữ cho bài viết hoặc biến thể quảng cáo.

### Vẫn còn thiếu

Bộ ảnh này **không phải ảnh chụp thiết bị đã lắp đặt cho khách hàng của chúng ta**. Nó minh hoạ đúng loại máy và đúng thao tác mô tả trong nội dung, nhưng không chứng minh một dự án cụ thể nào.

Trước khi chạy quảng cáo với thông điệp "đây là hệ thống chúng tôi đã triển khai", cần ảnh chụp tại dự án thật kèm quyền sử dụng bằng văn bản. Bảng kích thước phía trên vẫn dùng được cho bộ ảnh đó.
