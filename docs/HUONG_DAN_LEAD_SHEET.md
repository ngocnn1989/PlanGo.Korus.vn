# Hướng dẫn cấu hình kênh nhận lead PlanGo (Google Sheet + Apps Script)

Cơ chế giống landing1: form → `/api/leads` (Vercel, kiểm tra origin + chống bot + idempotency) → Apps Script Web App → ghi vào **Google Sheet riêng của PlanGo** + gửi mail báo lead. Script: `docs/apps-script/lead-webhook.gs` (bản `plango-2026-10-19`).

> Không dùng chung Sheet/webhook với landing1 (weldbot) — lead PlanGo sẽ lẫn vào lead robot hàn.

## 1. Tạo Google Sheet

1. Tạo file Google Sheet mới, ví dụ **"PlanGo – Lead"**, bằng tài khoản Google của KORUS.
2. Đổi tên tab đầu tiên thành đúng **`plango.korus.vn`** (script ghi theo TÊN tab; sai tên là từ chối, không ghi nhầm). Muốn tên khác thì đặt Script property `LEAD_SHEET_NAME`.
3. Để trống — lần ghi đầu tiên script tự tạo hàng tiêu đề:

| Thời gian | Họ tên | Số điện thoại | Nhà máy | Gói quan tâm | Email | Quy mô & nhu cầu | Đồng ý lúc | Idempotency Key |
|---|---|---|---|---|---|---|---|---|

"Gói quan tâm" hiển thị tiếng Việt (Gói Cơ bản / Tiêu chuẩn / Nâng cao / Doanh nghiệp / Chưa xác định). "Quy mô & nhu cầu" chứa số chuyền, số phân xưởng do công cụ ước tính điền sẵn.

## 2. Dán Apps Script và deploy

1. Trong Sheet: **Extensions → Apps Script** → xoá mã mẫu → dán toàn bộ `docs/apps-script/lead-webhook.gs` → Save.
2. **Project Settings → Script properties**:

| Property | Giá trị |
|---|---|
| `WEBHOOK_SECRET` | Chuỗi ngẫu nhiên dài (≥ 32 ký tự, không khoảng trắng). Giữ bí mật; dùng lại ở bước 3. |
| `NOTIFY_EMAIL` | Email nhận báo lead (nhiều địa chỉ ngăn bằng dấu phẩy). Trống = không gửi mail. |
| `LEAD_SHEET_NAME` | (tuỳ chọn) chỉ khi tab không tên `plango.korus.vn`. |

3. Chạy tay **`kiemTraMail`** một lần → bấm **Authorize** (cấp quyền gửi mail) → kiểm hộp thư (cả Spam).
4. Chạy tay **`kiemTraNhanh`** → log phải có `{"result":"success","row":N}`, Sheet có dòng "KIỂM TRA", hộp thư có mail `[PlanGo - Tự động] Lead mới: …`. Xoá dòng kiểm tra.
5. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone** → Deploy → chép **Web app URL** dạng `https://script.google.com/macros/s/<ID>/exec`.
6. Mở URL đó bằng trình duyệt: phải thấy `"version":"plango-2026-10-19"`, `"sheetFound":true`, `"secretConfigured":true`, `"notifyConfigured":true`.
7. Mỗi lần sửa script: **Deploy → Manage deployments → Edit → Version: New version** (chỉ Save là bản cũ vẫn chạy). URL giữ nguyên.

## 3. Cấu hình Vercel (project PlanGo)

Settings → Environment Variables (Production):

| Biến | Giá trị |
|---|---|
| `SITE_PROFILE` | `landing-plango` |
| `LEAD_PROVIDER` | `google_sheets` |
| `GOOGLE_SHEET_WEBHOOK_URL` | Web app URL ở bước 2.5 |
| `WEBHOOK_SECRET` | đúng chuỗi đã đặt trong Script properties |
| `LEAD_ALLOWED_ORIGINS` | `https://plango.korus.vn` (đúng MỘT origin, đúng domain Primary) |
| `PUBLIC_ENABLE_TRACKING` / `PUBLIC_GTM_ID` | khi có container GTM của PlanGo |

Đổi biến xong **phải Redeploy** (trang prerender đọc biến lúc build). Sau đó gửi thử một lead thật trên domain chính → phải chuyển sang `/thank-you/`, Sheet có dòng mới, có mail.

## 4. Hành vi khi chưa cấu hình

- Thiếu bộ biến `LEAD_*` (vd. chạy local): form và popup **vẫn hiển thị**; bấm gửi sẽ hiện ngay khung "Chưa gửi được yêu cầu" kèm Hotline/Zalo, không gọi API (cờ `data-lead-enabled="false"`).
- Cấu hình sai (URL không phải `script.google.com/macros/s/…/exec`, origin không https…): build dừng với mã lỗi, không phát hành bản hỏng.
- `LEAD_ALLOWED_ORIGINS` khác domain thật (www ↔ không www): API trả 403, khách thấy lỗi — kiểm tra domain Primary trên Vercel.

## 5. Tuỳ chọn: lead Facebook Lead Ads

Script giữ nguyên phần tab **"Tổng hợp"** của landing1 (cột: Thời gian, Họ và tên, Số điện thoại, Email, Đã gửi mail thông báo chưa, Gói quan tâm, Nhà máy, Quy mô & nhu cầu, Nguồn). Chỉ dùng khi chạy Facebook Lead Ads ghi vào Sheet: chạy `danhDauLeadCuDaGui` một lần, rồi `caiTriggerThongBao`. Không dùng thì bỏ qua — phần này không chạy nếu chưa cài trigger.
