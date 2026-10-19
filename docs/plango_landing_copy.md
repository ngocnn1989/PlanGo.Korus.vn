# PlanGo — Copy landing (G2, đã duyệt)

- Kế hoạch: PLANGO-LP-01 r2 · Ngày: 19/10/2026 · Trạng thái: **APPROVED** (owner 19/10/2026: Hero phương án A, giữ mặc định §3)
- Nguồn trong mã: `src/content/plango-copy.ts` (trang), `plango-product.ts` (dữ kiện + mã claim), `plango-pricing.ts` (gói, giá)
- Legal gate: `npm run legal` → đạt (lexicon 1.7.1, không có mục cần sửa)
- Nguyên tắc: lợi ích viết định tính và gắn với cơ chế tính toán có thật; chưa có con số hiệu quả cho tới khi đo thí điểm (G9).

---

## 1. Phương án tiêu đề Hero (chọn 1)

| # | H1 | Kiểu hook | Ghi chú |
|---|---|---|---|
| **A (đề xuất)** | **Lập kế hoạch chuyền may trong một lệnh chat** | Demo / cách làm | Nói ngay điểm khác biệt; đang dùng trong code |
| B | Rút ngắn thời gian lập kế hoạch sản xuất may | Lợi ích | Đúng yêu cầu owner, ít khác biệt hơn |
| C | Hệ thống tính phương án, bạn chọn kế hoạch | Vai trò | Nhấn "số liệu do hệ thống tính" |

Phương án nút kêu gọi chính: **Đặt lịch demo** (đề xuất) · *Nhắn Zalo xem demo*.

---

## 2. Copy từng section

### S01 · Hero
- Dòng nhỏ: Trợ lý AI lập kế hoạch sản xuất may
- **H1:** Lập kế hoạch chuyền may trong một lệnh chat
- Mô tả: PlanGo nhận đơn hàng từ Excel, tự tính 2–3 phương án kế hoạch cho toàn nhà máy và cho bạn thấy tải của từng chuyền trên một bảng Gantt. Rút ngắn thời gian lập kế hoạch, tận dụng công suất các chuyền may.
- Nút: **Đặt lịch demo** · Xem bảng giá
- Dòng phụ: Số liệu do hệ thống tính · Dữ liệu lưu tại máy của nhà máy

### S01b · Lợi ích — *Kế hoạch nhanh hơn, chuyền may chạy đều hơn*
Bốn thay đổi PlanGo mang lại cho phòng kế hoạch và xưởng may — mỗi điểm dựa trên cách hệ thống tính toán, không dựa trên phỏng đoán.

| Mã | Lợi ích | Diễn giải trên trang | Căn cứ trong sản phẩm |
|---|---|---|---|
| b1 | **Rút ngắn thời gian lập kế hoạch** | Ra lệnh bằng chat, hệ thống tự tính và trả về 2–3 phương án kế hoạch. Không phải gom nhiều file và tính tay từng chuyền. | Bộ sinh phương án tự động |
| b2 | **Lịch sản xuất được tối ưu** | Mỗi phương án được chấm điểm theo đúng hạn giao, cân bằng tải chuyền, ngày chuyền chờ việc, giờ tăng ca, số lần tách đơn và độ đồng bộ ngày hoàn thành. | Bộ chấm điểm 6 tiêu chí |
| b3 | **Tận dụng công suất các chuyền may** | Công suất tính theo năng suất và lao động thực có của từng chuyền. Gantt cho thấy chuyền nào đang rảnh, chuyền nào quá tải để xếp việc lấp khoảng trống. | Công suất = năng suất × lao động; điểm trừ ngày chuyền chờ việc |
| b4 | **Nền tảng để nâng năng suất lao động** | Giảm chờ việc và tăng ca không cần thiết ngay từ khâu kế hoạch; sản lượng thực tế nhập hằng ngày để theo dõi năng suất từng chuyền, từng đơn. | Điểm trừ tăng ca/chờ việc; sản lượng thực tế hằng ngày |

Chú thích nhỏ: *Mức hiệu quả cụ thể phụ thuộc dữ liệu và cách vận hành của từng nhà máy; KORUS cùng nhà máy đo trước và sau khi áp dụng.*

### S02 · Vấn đề — *Kế hoạch chuyền may rải rác nhiều file?*
Khi đơn hàng, năng suất và lao động nằm ở nhiều bảng tính khác nhau, mỗi lần đổi kế hoạch là một lần gom lại và tính lại.
- **Số liệu lệch nhau** — Mỗi file một phiên bản, khó biết con số nào đang đúng.
- **Không rõ chuyền nào rảnh** — Chỉ thấy chuyền chờ việc hay quá tải khi xưởng đã chạy.
- **Tính tay mất thời gian** — Mỗi phương án phải cộng trừ ngày, năng suất, lao động bằng tay.

### S03 · Cách cũ · Cách mới
| Cách cũ | Với PlanGo |
|---|---|
| Gom file Excel bằng tay | Nhập Excel có kiểm duyệt, xác nhận rồi mới lưu |
| Đoán chuyền nào còn rảnh | Gantt từng chuyền, thấy ngay khoảng trống và quá tải |
| Tính tay từng phương án | Hệ thống tính 2–3 phương án, bạn chọn |
| Phát hiện trễ hạn khi đã muộn | Cảnh báo xung đột tải và rủi ro trễ hạn giao |

### S04 · Cách hoạt động — *Ba bước, ngay trong khung chat*
Giám đốc sản xuất trao đổi với trợ lý AI như với một nhân viên kế hoạch; mọi con số do hệ thống PlanGo tính.
1. **Nhập đơn hàng từ Excel** — Gửi file đơn hàng theo mẫu quen thuộc. PlanGo kiểm tra cột, ngày tháng, dữ liệu thiếu và cho bạn xem trước trước khi lưu.
2. **Chọn phương án kế hoạch** — Gõ "Lập kế hoạch tháng 11 cho xưởng". Hệ thống trả về 2–3 phương án đã chấm điểm kèm phương án được đề xuất.
3. **Xác nhận rồi mới lưu** — Duyệt phương án, Gantt từng chuyền cập nhật ngay; xuất kế hoạch sản xuất ra Excel để gửi xưởng.

Nút: Xem demo trên dữ liệu mẫu

### S04b · Bộ tối ưu — *Mỗi phương án được chấm điểm theo 6 tiêu chí*
PlanGo xếp đơn hàng vào chuyền theo công suất thực có — năng suất nhân lao động hiệu dụng — rồi so các phương án bằng cùng một thang điểm.
- Đúng hạn giao hàng · Cân bằng tải giữa các chuyền · Ít ngày chuyền nằm chờ việc · Ít giờ tăng ca · Ít tách nhỏ đơn hàng · Các chuyền hoàn thành đồng bộ

Chọn hướng phù hợp với tình hình xưởng: **Ít xáo trộn kế hoạch đang chạy** · **Cân bằng tải toàn phân xưởng** · **Ưu tiên kịp hạn giao**

*Đơn đang chạy và kế hoạch đã chốt được giữ nguyên; phương án mới chỉ được lưu khi bạn xác nhận.*

### S05 · Tính năng — *Đủ công cụ cho một vòng kế hoạch — tiến độ*
- **Gantt theo từng chuyền** — Thanh kế hoạch theo chuyền, tách phần thực tế và phần dự báo.
- **Công suất theo lao động** — Công suất = năng suất × lao động hiệu dụng của từng chuyền, từng ngày.
- **Báo xung đột tải chuyền** — Phát hiện chuyền bị xếp chồng việc trước khi kế hoạch được lưu.
- **Sản lượng thực tế hằng ngày** — Nhập trên bảng tiến độ hoặc bằng chat; theo dõi chênh lệch kế hoạch — thực tế.
- **Báo cáo tiến độ tháng (BCTĐ)** — Nhập và xuất BCTĐ theo phân xưởng, có bước xem trước trước khi ghi.
- **Xuất KHSX ra Excel** — Kế hoạch sản xuất xuất theo mẫu Excel của nhà máy.
- **Bảng tiến độ toàn nhà máy** — Xem theo nhà máy, phân xưởng, chuyền với các chỉ số KPI chính.
- **Báo cáo rà soát rủi ro** — Khi có biến động, nhận báo cáo rủi ro và gợi ý phương án điều chỉnh.

### S06 · An toàn dữ liệu — *Dữ liệu của nhà máy ở lại nhà máy*
- **Lưu trên máy tại nhà máy** — Cơ sở dữ liệu kế hoạch và tiến độ nằm trên máy tính của xưởng, không lưu trên máy chủ của KORUS.
- **Hệ thống tính, AI không đoán số** — AI chỉ điều phối, hỏi lại và giải thích; mọi con số do bộ tính toán của PlanGo xử lý.
- **Xem trước, xác nhận rồi mới ghi** — Nhập đơn, nhập tiến độ, đổi kế hoạch đều qua bước xem trước và xác nhận.
- **Bản quyền theo máy** — Phần mềm kiểm tra bản quyền và tính toàn vẹn mỗi khi chạy.

### S07 · Bảng giá — *Chọn gói theo số chuyền của nhà máy*
Phí thuê bao theo năm cộng phí triển khai một lần. Thêm chuyền ngoài hạn mức tính theo tháng.

| | Cơ bản | **Tiêu chuẩn** *(phù hợp nhà máy vừa)* | Nâng cao | Doanh nghiệp |
|---|---|---|---|---|
| Đối tượng | Xưởng nhỏ, một phân xưởng | Nhà máy vừa, nhiều phân xưởng | Nhà máy lớn | Tập đoàn, nhiều nhà máy |
| Số chuyền | 1–5 | 6–15 | 16–40 | trên 40 |
| Phân xưởng | 1 | đến 4 | không giới hạn trong một nhà máy | nhiều nhà máy |
| Máy cài đặt | 1 | 1 | 2 | theo thỏa thuận |
| **Hiển thị trên trang** | **Từ 24 triệu/năm** | **Từ 60 triệu/năm** | **Từ 120 triệu/năm** | **Báo giá riêng** |
| Khoảng phí năm (nội bộ/ước tính) | 24–36 triệu | 60–84 triệu | 120–180 triệu | — |
| Triển khai một lần | từ 8 triệu | từ 20 triệu | từ 40 triệu | — |
| Thêm chuyền | 300–400 nghìn/chuyền/tháng | 250–350 nghìn | 200–300 nghìn | — |
| Hỗ trợ | Zalo, điện thoại, email giờ hành chính | + điều khiển từ xa | + đào tạo tại nhà máy, xử lý ưu tiên | theo thỏa thuận |

Ma trận chức năng: theo `plangoFeatureMatrix` (12 dòng, như §5.4 kế hoạch).

Ghi chú dưới bảng:
- Phí bản quyền thuê bao theo năm (cài trên máy của nhà máy) và phí triển khai một lần gồm khảo sát, khai báo xưởng/chuyền, chuyển mẫu Excel và đào tạo.
- Có phương án mua bản quyền một lần: khoảng 2,5 lần phí năm, từ năm thứ hai trả 20% mỗi năm cho bảo trì và cập nhật.
- Giá chưa gồm VAT. Mức phí trên trang là khoảng tham khảo; báo giá chính thức gửi sau buổi khảo sát nhà máy.

Công cụ ước tính: nhập *Số chuyền may* + *Số phân xưởng* → *Gói gợi ý* + *Phí năm tham khảo* → nút **Nhận báo giá chi tiết**.

### S08 · Triển khai tại nhà máy
KORUS cùng phòng kế hoạch đi từng bước, dùng chính file Excel nhà máy đang có.
1. **Khảo sát** — Tìm hiểu cơ cấu phân xưởng, chuyền, mẫu đơn hàng và báo cáo hiện tại.
2. **Cài đặt và khai báo** — Cài PlanGo trên máy của nhà máy, khai báo phân xưởng, chuyền, lịch làm việc, năng suất.
3. **Chạy thử dữ liệu thật** — Nhập đơn hàng và tiến độ hiện có, đối chiếu kế hoạch với cách làm cũ.
4. **Đào tạo và vận hành** — Hướng dẫn giám đốc sản xuất, quản đốc thao tác hằng ngày; hỗ trợ trong quá trình chạy.

Nút: Đặt lịch khảo sát

### S09 · Video — *Xem PlanGo trong 30 giây*
Kế hoạch rải rác nhiều file? · Lập kế hoạch bằng chat · Cách cũ · Cách mới — *Video dùng giao diện minh họa với dữ liệu demo.*

### S10 · Câu hỏi thường gặp
1. **Nhà máy có phải bỏ Excel không?** — Không. PlanGo nhận đơn hàng và tiến độ từ Excel, xuất kế hoạch và báo cáo ra Excel theo mẫu của nhà máy.
2. **Dữ liệu của nhà máy được lưu ở đâu?** — Cơ sở dữ liệu của PlanGo nằm trên máy tính đặt tại nhà máy, không lưu trên máy chủ của KORUS. Nội dung bạn trao đổi trong khung chat đi qua nhà cung cấp trợ lý AI mà nhà máy sử dụng.
3. **PlanGo rút ngắn thời gian lập kế hoạch bằng cách nào?** — Thay vì gom file và tính tay, bạn ra một lệnh chat; hệ thống tự xếp đơn vào chuyền theo công suất thực có và trả về 2–3 phương án đã chấm điểm để chọn.
4. **Làm sao PlanGo giúp tận dụng công suất chuyền?** — Công suất từng chuyền được tính từ năng suất và lao động hiệu dụng. Bộ tối ưu trừ điểm những phương án để chuyền nằm chờ việc hoặc dồn tăng ca, và Gantt cho thấy khoảng trống để xếp thêm việc.
5. **AI có tự quyết định kế hoạch không?** — Không. AI điều phối, hỏi lại khi thiếu dữ liệu và giải thích phương án. Con số do hệ thống tính, kế hoạch chỉ được lưu khi bạn xác nhận.
6. **Cần máy tính và phần mềm gì?** — Một máy tính Windows tại nhà máy và tài khoản trợ lý AI (Codex hoặc Antigravity). KORUS hướng dẫn chuẩn bị trong bước khảo sát.
7. **Nhà máy tăng thêm chuyền thì tính phí thế nào?** — Mỗi chuyền ngoài hạn mức của gói tính thêm theo tháng; khi vượt hẳn hạn mức, nhà máy chuyển lên gói kế tiếp.
8. **Có xem thử trước khi quyết định không?** — Có. KORUS sắp xếp buổi demo trên dữ liệu mẫu, hoặc trên file Excel của nhà máy nếu bạn muốn.

### S11 · Liên hệ — *Đặt lịch demo PlanGo*
Để lại thông tin và quy mô nhà máy. KORUS liên hệ để sắp xếp buổi demo và gửi báo giá theo số chuyền.
Form (cập nhật ở G5): Họ và tên* · Số điện thoại* · Tên nhà máy · Số chuyền may · Số phân xưởng · Gói quan tâm · Nhu cầu · Email.
Hotline / Zalo: 0912 610 011 · PlanGo.korus.vn

### Footer
PlanGo là phần mềm do Công ty Cổ phần Công nghệ KORUS phát triển và giữ bản quyền. © 2026 Công ty Cổ phần Công nghệ KORUS.

### SEO
- Title: PlanGo — Phần mềm lập kế hoạch sản xuất may bằng chat | KORUS
- Description: PlanGo giúp nhà máy may nhập đơn hàng từ Excel có kiểm duyệt, chọn phương án kế hoạch và theo dõi Gantt từng chuyền. Dữ liệu lưu tại máy của nhà máy.

---

## 3. Owner cần xác nhận khi duyệt copy

1. Chọn tiêu đề Hero A / B / C.
2. FAQ 6 nêu "tài khoản trợ lý AI (Codex hoặc Antigravity)" do nhà máy chuẩn bị — đúng mô hình kinh doanh chưa (kế hoạch §8.3)?
3. FAQ 8 và nút "Xem demo trên dữ liệu mẫu": KORUS có sẵn bộ dữ liệu mẫu để demo (kế hoạch §8.4)?
4. Dòng "mua bản quyền một lần" có hiển thị công khai không (§8.2)?
5. Ma trận chức năng theo gói hiện **chưa được khóa kỹ thuật** trong license sản phẩm (§8.7) — chấp nhận ghi trên trang như điều khoản dịch vụ hay ẩn ma trận cho tới khi có khóa?
