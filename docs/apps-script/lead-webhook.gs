/**
 * Webhook nhận lead từ landing PlanGo (PlanGo.korus.vn) và ghi vào Google Sheet.
 *
 * Thiết kế giống landing1 (bản 2026-10-09.1); khác ở: tab nguồn mặc định
 * 'plango.korus.vn', cột Nhà máy / Gói quan tâm / Quy mô & nhu cầu, tiêu đề mail
 * [PlanGo - Tự động], và KHÔNG có địa chỉ mail mặc định gài cứng — đặt Script
 * property NOTIFY_EMAIL.
 *
 * Triển khai: Extensions → Apps Script → dán toàn bộ file này → Deploy →
 * New deployment → Web app → Execute as: Me → Who has access: Anyone.
 * Rồi Project Settings → Script properties → thêm WEBHOOK_SECRET, NOTIFY_EMAIL.
 * Hướng dẫn đầy đủ: docs/HUONG_DAN_LEAD_SHEET.md.
 *
 * ĐIỂM QUAN TRỌNG NHẤT — dạng phản hồi:
 * Landing chỉ chấp nhận đúng ba dạng ack, và so khớp TUYỆT ĐỐI danh sách khóa.
 * Thừa hay thiếu một khóa là toàn bộ phản hồi bị từ chối, KỂ CẢ khi dòng đã ghi
 * xong — khách sẽ thấy "Chưa gửi được nhu cầu" dù lead đã vào sheet, rồi bấm
 * gửi lại và tạo dòng trùng. Ba dạng hợp lệ:
 *   {"result":"success","row":<số>}      ← dùng dạng này, gắn với dòng thật
 *   {"success":true,"receiptId":"<chuỗi>"}
 *   {"ok":true}
 * Đừng bao giờ thêm trường debug/warning vào phản hồi thành công.
 *

 * (Lịch sử dưới đây là của bản gốc landing1/weldbot, giữ để tra cứu.)
 * Bản 2026-10-09.1: sửa guiMailLeadMoi chạy 1–6 phút và hết giờ — leadSheetName()
 *   đọc Script property cho từng ô (~10.000 lần/lần chạy); nay đọc một lần. Thêm
 *   một dòng log thời gian chạy.
 *
 * Bản 2026-10-09: "Tổng hợp" không còn mất lead khi tab nguồn bị chèn hàng.
 *   - Công thức đổi sang INDEX(plango.korus.vn!X:X, ROW()) + neo ở cột A
 *     (suaCongThucTongHop chạy tay một lần để chuyển).
 *   - guiMailLeadMoi tự phát hiện chèn/xoá hàng qua neo, chuyển cờ E theo lead
 *     rồi mới gửi mail; không còn dừng hẳn ở lỗi tong_hop_misaligned_rows.
 *
 * Bản 2026-10-05.2:
 *   - Mail báo lead tách khỏi việc ghi sheet: ghi sheet lỗi vẫn gửi mail, tiêu
 *     đề có "[Weldbot - Tự động] ⚠ Lead mới CHƯA lưu vào sheet" kèm lý do, nên lead không bao giờ mất.
 *   - Tiêu đề cột so không phân biệt hoa/thường và khoảng trắng; hết cột trống
 *     thì tự chèn cột; dòng tiêu đề đặt bằng HEADER_ROW.
 *   - doGet báo thêm missingColumns, mailQuota, lastMail để chẩn đoán.
 *
 * Bản 2026-10-05: ghi vào tab tên LEAD_SHEET_NAME (mặc định 'weldbot.tech'),
 * không còn ghi vào tab đầu tiên; thiếu tab đúng tên thì từ chối, không ghi nhầm.
 *
 * Bản 2026-09-10 khác bản trước ở bốn điểm:
 *   1. Ghi theo TÊN cột, không theo vị trí. Thêm trường mới chỉ cần thêm vào
 *      COLUMNS; sheet đang chạy tự thêm cột thiếu, không mất dữ liệu cũ.
 *   2. Nhận thêm company và application (nguyên nhân lỗi "có dòng thiếu cột").
 *   3. Có LockService: hai lead vào cùng lúc không còn đọc trùng lastRow.
 *   4. Không để lỗi xảy ra SAU khi đã ghi dòng.
 */

/**
 * Thứ tự ở đây là thứ tự cột trong sheet mới.
 * Với sheet đang chạy, cột thiếu được thêm vào CUỐI để không xô lệch dữ liệu cũ.
 * Muốn thêm trường mới sau này: thêm một dòng vào đây, không cần sửa gì khác.
 * Đổi tên cột trong sheet thì phải đổi label ở đây cho khớp (hoa/thường và
 * khoảng trắng thừa không tính), nếu không script coi là thiếu và thêm cột mới.
 */
var COLUMNS = [
  { key: '_timestamp',      label: 'Thời gian' },
  { key: 'name',            label: 'Họ tên' },
  { key: 'phone',           label: 'Số điện thoại' },
  { key: 'company',         label: 'Nhà máy' },
  { key: 'application',     label: 'Gói quan tâm' },
  { key: 'email',           label: 'Email' },
  { key: 'message',         label: 'Quy mô & nhu cầu' },
  { key: 'consent_at',      label: 'Đồng ý lúc' },
  { key: 'idempotency_key', label: 'Idempotency Key' }
];

/** Đổi mã gói (trường application của form) sang tiếng Việt cho người đọc sheet. */
var APPLICATION_LABELS = {
  'co-ban':       'Gói Cơ bản',
  'tieu-chuan':   'Gói Tiêu chuẩn',
  'nang-cao':     'Gói Nâng cao',
  'doanh-nghiep': 'Gói Doanh nghiệp',
  'undecided':    'Chưa xác định'
};

var SCRIPT_VERSION = 'plango-2026-10-19';
var SITE_NAME = 'PlanGo.korus.vn';
/**
 * Tab nhận lead, chọn theo TÊN chứ không theo vị trí: Web App không có "sheet
 * đang mở", getActiveSheet() trả tab đầu tiên, nên chèn một tab lên trước là
 * lead ghi nhầm sang đó. Đổi tên tab thì đặt Script property LEAD_SHEET_NAME.
 */
var LEAD_SHEET_NAME_DEFAULT = 'plango.korus.vn';
/** Dòng chứa tiêu đề cột. Muốn chừa dòng trang trí phía trên thì tăng số này. */
var HEADER_ROW = 1;
/** Không gài địa chỉ cá nhân trong mã: đặt Script property NOTIFY_EMAIL. Trống = không gửi mail. */
var NOTIFY_EMAIL_DEFAULT = '';
var MAX_CELL_LENGTH = 2000;
var LOCK_TIMEOUT_MS = 20000;
/** Cùng idempotency key chỉ báo mail một lần trong khoảng này (khách gửi lại sau lỗi). */
var MAIL_DEDUP_SECONDS = 6 * 60 * 60;

function jsonOutput(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Phản hồi lỗi. Không dùng dạng ack hợp lệ, để landing hiểu là thất bại thật. */
function failure(reason) {
  return jsonOutput({ ok: false, error: String(reason) });
}

/**
 * Đọc Script property MỘT lần mỗi lần chạy rồi nhớ lại. syncTongHop gọi hàm này
 * cho từng ô (~10.000 lần/lần chạy); mỗi lần đọc property mất ~30 ms nên không
 * nhớ lại là guiMailLeadMoi chạy 1–6 phút và hết giờ (sự cố 09/10/2026).
 */
var leadSheetNameCache = null;
function leadSheetName() {
  if (leadSheetNameCache === null) {
    leadSheetNameCache = PropertiesService.getScriptProperties().getProperty('LEAD_SHEET_NAME') || LEAD_SHEET_NAME_DEFAULT;
  }
  return leadSheetNameCache;
}

/** Tab nhận lead, hoặc null nếu không có tab đúng tên — khi đó phải từ chối, không ghi bừa. */
function getLeadSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(leadSheetName());
}

function readPayload(e) {
  if (e && e.parameter && Object.keys(e.parameter).length > 0) return e.parameter;
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (error) { return {}; }
  }
  return {};
}

function cell(value) {
  var text = value === null || value === undefined ? '' : String(value);
  return text.length > MAX_CELL_LENGTH ? text.slice(0, MAX_CELL_LENGTH) : text;
}

/** Chuẩn hoá tên cột để so khớp: bỏ khoảng trắng thừa, không phân biệt hoa/thường. */
function normalizeLabel(value) {
  return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function columnLabels() {
  return COLUMNS.map(function (column) { return column.label; });
}

/**
 * Đọc hàng tiêu đề, không sửa gì. Trả mảng tên cột ĐÃ CHUẨN HOÁ theo đúng vị
 * trí trong sheet, hoặc [] nếu hàng tiêu đề còn trống.
 */
function readHeader(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (sheet.getLastRow() < HEADER_ROW || lastColumn === 0) return [];

  var header = sheet.getRange(HEADER_ROW, 1, 1, lastColumn).getValues()[0].map(normalizeLabel);
  var hasAny = header.some(function (label) { return label !== ''; });
  return hasAny ? header : [];
}

/** Các cột trong COLUMNS chưa có trong header (theo tên gốc để người đọc dễ hiểu). */
function missingLabels(header) {
  return columnLabels().filter(function (label) {
    return header.indexOf(normalizeLabel(label)) === -1;
  });
}

/**
 * Đảm bảo hàng tiêu đề khớp COLUMNS.
 * Hàng tiêu đề trống thì tạo mới. Thiếu cột thì thêm vào cuối — dữ liệu cũ giữ
 * nguyên vị trí; hết cột trống thì chèn thêm cột trước, để không lỗi "ngoài
 * kích thước sheet" khi ai đó xoá các cột thừa bên phải.
 * Trả về mảng tên cột đã chuẩn hoá theo đúng thứ tự thật trong sheet.
 */
function ensureHeader(sheet) {
  var header = readHeader(sheet);

  if (header.length === 0) {
    var labels = columnLabels();
    ensureColumnCount(sheet, labels.length);
    sheet.getRange(HEADER_ROW, 1, 1, labels.length).setValues([labels]).setFontWeight('bold');
    sheet.setFrozenRows(HEADER_ROW);
    return labels.map(normalizeLabel);
  }

  var missing = missingLabels(header);
  if (missing.length > 0) {
    ensureColumnCount(sheet, header.length + missing.length);
    sheet.getRange(HEADER_ROW, header.length + 1, 1, missing.length)
      .setValues([missing])
      .setFontWeight('bold');
    header = header.concat(missing.map(normalizeLabel));
  }

  return header;
}

function ensureColumnCount(sheet, needed) {
  var max = sheet.getMaxColumns();
  if (needed > max) sheet.insertColumnsAfter(max, needed - max);
}

/** Vị trí cột theo key (1-based), 0 nếu không có. */
function columnIndex(header, key) {
  for (var i = 0; i < COLUMNS.length; i++) {
    if (COLUMNS[i].key === key) return header.indexOf(normalizeLabel(COLUMNS[i].label)) + 1;
  }
  return 0;
}

/** Tìm dòng đã ghi cùng idempotency key. Trả số dòng, hoặc 0 nếu chưa có. */
function findExistingRow(sheet, header, idempotencyKey) {
  if (!idempotencyKey) return 0;
  var index = columnIndex(header, 'idempotency_key');
  if (index === 0) return 0;

  var firstDataRow = HEADER_ROW + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < firstDataRow) return 0;

  var values = sheet.getRange(firstDataRow, index, lastRow - HEADER_ROW, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === idempotencyKey) return i + firstDataRow;
  }
  return 0;
}

function buildRow(header, data) {
  var application = cell(data.application);
  var byKey = {
    _timestamp:      Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss'),
    name:            cell(data.name),
    phone:           cell(data.phone),
    company:         cell(data.company),
    application:     APPLICATION_LABELS[application] || application,
    email:           cell(data.email),
    message:         cell(data.message),
    consent_at:      cell(data.consent_at),
    idempotency_key: cell(data.idempotency_key)
  };

  // Ghi theo thứ tự cột THẬT của sheet, nên sheet cũ có thứ tự khác vẫn đúng.
  // Cột không thuộc COLUMNS (cột người dùng tự thêm) để trống.
  return header.map(function (label) {
    for (var i = 0; i < COLUMNS.length; i++) {
      if (normalizeLabel(COLUMNS[i].label) === label) return byKey[COLUMNS[i].key];
    }
    return '';
  });
}

/**
 * Mở URL webhook bằng trình duyệt để biết NGAY đang chạy bản nào.
 *
 * Đây là cách nhanh nhất loại trừ nguyên nhân hay gặp nhất: sửa mã, bấm Save,
 * nhưng quên Deploy → New version, nên bản đang phục vụ vẫn là bản cũ.
 *
 * Kỳ vọng khi mở URL:
 *   {"version":"plango-2026-10-19","sheetFound":true,"missingColumns":[],"notifyConfigured":true,...}
 *   Lỗi "Script function not found: doGet"        ← ĐANG CHẠY BẢN CŨ, phải deploy lại
 *
 * Không trả dữ liệu lead, địa chỉ mail hay secret, nên mở công khai vẫn an toàn.
 */
function doGet() {
  var labels = columnLabels();
  var hasSecret = !!PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');

  var sheetColumns = 0;
  var sheetFound = false;
  var missingColumns = labels;
  try {
    var sheet = getLeadSheet();
    sheetFound = !!sheet;
    if (sheet) {
      var header = readHeader(sheet);
      sheetColumns = header.length;
      // Hàng tiêu đề trống thì lần ghi đầu tự tạo đủ cột, không tính là thiếu.
      missingColumns = header.length === 0 ? [] : missingLabels(header);
    } else {
      sheetColumns = -1;
    }
  } catch (error) {
    sheetColumns = -1;
  }

  // -1: chưa cấp quyền gửi mail cho script (chạy kiemTraMail một lần để Authorize).
  var mailQuota = -1;
  try { mailQuota = MailApp.getRemainingDailyQuota(); } catch (error) {}

  return jsonOutput({
    version: SCRIPT_VERSION,
    columns: labels.length,
    columnLabels: labels,
    sheetName: leadSheetName(),
    sheetFound: sheetFound,
    sheetColumns: sheetColumns,
    missingColumns: missingColumns,
    mailQuota: mailQuota,
    lastMail: readLastMailStatus(),
    notifyConfigured: !!(PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || NOTIFY_EMAIL_DEFAULT),
    secretConfigured: hasSecret
  });
}

/** Lưu kết quả lần gửi mail gần nhất (không kèm địa chỉ hay nội dung) để doGet báo lại. */
function recordLastMailStatus(ok, reason) {
  try {
    PropertiesService.getScriptProperties().setProperty('LAST_MAIL_STATUS', JSON.stringify({
      at: Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss'),
      ok: ok,
      // doGet công khai: che địa chỉ mail có thể nằm trong thông báo lỗi.
      error: ok ? '' : String(reason).replace(/\S+@\S+/g, '<email>').slice(0, 200)
    }));
  } catch (error) {}
}

function readLastMailStatus() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('LAST_MAIL_STATUS');
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

/** Nguồn hiển thị cho người đọc: "FB" -> Facebook, "Google" -> website (form landing). */
function sourceDisplayName(source) {
  var key = normalizeLabel(source);
  if (key === 'fb' || key === 'facebook') return 'Facebook';
  if (key === 'google' || key === 'website') return 'website';
  return String(source).trim();
}

/** Một dòng, không xuống dòng, cắt gọn: dùng cho tiêu đề mail (chống chèn header từ dữ liệu khách). */
function oneLine(value, max) {
  var text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/**
 * Dựng tiêu đề và nội dung mail báo lead, DÙNG CHUNG cho lead Google (doPost) và
 * Facebook (Tổng hợp) để hai loại mail luôn cùng một mẫu. Văn bản thuần, gửi
 * Giám đốc: tiêu đề có sẵn tên + số điện thoại để đọc ngay ở hộp thư đến.
 *
 * lead: { name, phone, email, company, application, message, time, sourceLabel }
 * sheetError khác rỗng: lead CHƯA vào sheet, mail là bản ghi duy nhất.
 */
function buildLeadMail(lead, sheetError) {
  var who = oneLine([lead.name, lead.phone].filter(function (v) { return String(v).trim() !== ''; }).join(' – '), 70);
  var tag = '[PlanGo - Tự động] ';
  var subject = tag + (sheetError ? '⚠ Lead mới CHƯA lưu vào sheet: ' : 'Lead mới: ') + who;

  var details = [
    ['Họ tên',                lead.name],
    ['Điện thoại',            lead.phone],
    ['Email',                 lead.email],
    ['Nhà máy',               lead.company],
    ['Gói quan tâm',          lead.application],
    ['Quy mô & nhu cầu',      lead.message],
    ['Nguồn',                 lead.sourceLabel],
    ['Thời gian nhận',        lead.time]
  ].filter(function (field) { return String(field[1]).trim() !== ''; })
   .map(function (field) {
     // Trường ngắn gộp một dòng; riêng Nội dung giữ xuống dòng của khách nhưng thụt lề cho thẳng cột.
     var text = field[0] === 'Quy mô & nhu cầu'
       ? String(field[1]).trim().replace(/\r?\n/g, '\n    ')
       : oneLine(field[1], 300);
     return '  ' + field[0] + ': ' + text;
   });

  var lines = ['Kính gửi Anh/Chị,', ''];
  if (sheetError) {
    lines.push('Hệ thống vừa nhận một yêu cầu demo PlanGo từ ' + SITE_NAME + ', nhưng KHÔNG lưu được vào',
               'bảng theo dõi lead. Thư này là bản ghi duy nhất, đề nghị chuyển bộ phận nhập tay.');
  } else {
    lines.push('Hệ thống vừa nhận một yêu cầu demo / báo giá PlanGo từ ' + SITE_NAME + ' (nguồn ' + lead.sourceLabel + ').');
  }
  lines.push('', 'THÔNG TIN KHÁCH HÀNG', details.join('\n'), '',
             'Đề nghị liên hệ lại khách hàng theo số điện thoại trên.');
  if (sheetError) {
    lines.push('', 'Chi tiết kỹ thuật (cho bộ phận IT): ' + oneLine(sheetError, 300));
  }
  lines.push('', '--', 'Thư tự động từ hệ thống tiếp nhận lead ' + SITE_NAME + '. Vui lòng không trả lời thư này.');

  return { subject: subject, body: lines.join('\n') };
}

/**
 * Báo mail khi có lead mới. Người nhận lấy từ Script property NOTIFY_EMAIL
 * (nhiều địa chỉ thì ngăn bằng dấu phẩy); chưa đặt thì dùng NOTIFY_EMAIL_DEFAULT.
 * sheetError khác null nghĩa là lead CHƯA vào sheet: mail là bản ghi duy nhất,
 * tiêu đề phải nói rõ để người nhận nhập tay.
 * Không bao giờ ném lỗi và không bao giờ đưa webhook_secret vào mail: lỗi gửi
 * mail không được làm landing tưởng lead thất bại sau khi dòng đã ghi.
 */
function notifyNewLead(data, sheetError) {
  try {
    var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || NOTIFY_EMAIL_DEFAULT;
    if (!to) return;

    // Khách gửi lại sau lỗi thì cùng idempotency key: chỉ báo một lần.
    var dedupKey = data.idempotency_key ? 'mailed:' + String(data.idempotency_key).slice(0, 200) : '';
    var cache = CacheService.getScriptCache();
    if (dedupKey && cache.get(dedupKey)) return;

    var application = cell(data.application);
    var mail = buildLeadMail({
      name:        cell(data.name),
      phone:       cell(data.phone),
      email:       cell(data.email),
      company:     cell(data.company),
      application: APPLICATION_LABELS[application] || application,
      message:     cell(data.message),
      time:        Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm'),
      sourceLabel: 'website'
    }, sheetError);

    MailApp.sendEmail({ to: to, subject: mail.subject, body: mail.body });

    if (dedupKey) cache.put(dedupKey, '1', MAIL_DEDUP_SECONDS);
    recordLastMailStatus(true, '');
  } catch (error) {
    console.error('notifyNewLead lỗi: ' + error);
    recordLastMailStatus(false, error);
  }
}

/* ========================================================================
 * Báo mail cho lead KHÔNG đi qua doPost (Facebook Lead Ads).
 *
 * Lead Facebook do Meta/đối tác ghi thẳng vào tab nguồn nên doPost không bao
 * giờ thấy. Tab "Tổng hợp" là công thức chuẩn hoá từ tab nguồn (cột Nguồn:
 * Google / FB) và có cột "Đã gửi mail thông báo chưa" (ô tick) dùng làm cờ.
 *
 * Phân vai để không gửi trùng:
 *   - Nguồn = Google: doPost đã báo mail (notifyNewLead). Ở đây chỉ TICK cờ,
 *     không gửi, để cột cờ phản ánh đúng "đã xử lý".
 *   - Nguồn khác (FB): gửi mail rồi mới tick. Gửi lỗi thì không tick, lần
 *     chạy sau thử lại.
 * Hàm chỉ chạy qua trigger On change (khiSheetThayDoi), và tự bỏ qua nếu chưa
 * chạy danhDauLeadCuDaGui một lần (xem bên dưới).
 * ====================================================================== */

var SHEET_TONG_HOP = 'Tổng hợp';
/** Nguồn mà doPost đã tự báo mail. So không phân biệt hoa/thường. */
var SOURCE_HANDLED_BY_DOPOST = 'google';
var MAX_SHEET_MAILS_PER_RUN = 20;
var TONG_HOP_READY_PROPERTY = 'TONG_HOP_BASELINE_DONE';

/** Tên cột (đã chuẩn hoá) cần có ở "Tổng hợp". Thiếu cột nào là dừng và báo lỗi. */
var TONG_HOP_HEADERS = {
  time:    'thời gian',
  name:    'họ và tên',
  phone:   'số điện thoại',
  email:   'email',
  sent:    'đã gửi mail thông báo chưa',
  app:     'gói quan tâm',
  company: 'nhà máy',
  message: 'quy mô & nhu cầu',
  source:  'nguồn'
};

/** Trả { sheet, col: {key: chỉ số 1-based} } hoặc null nếu thiếu tab/cột (đã ghi trạng thái lỗi). */
function openTongHop() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TONG_HOP);
  if (!sheet) {
    recordLastMailStatus(false, 'tong_hop_not_found');
    return null;
  }
  var lastColumn = sheet.getLastColumn();
  var header = lastColumn === 0 ? [] : sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(normalizeLabel);
  var col = {};
  for (var key in TONG_HOP_HEADERS) {
    col[key] = header.indexOf(TONG_HOP_HEADERS[key]) + 1;
    if (col[key] === 0) {
      recordLastMailStatus(false, 'tong_hop_missing_column: ' + TONG_HOP_HEADERS[key]);
      return null;
    }
  }
  return { sheet: sheet, col: col };
}

function hasLeadIdentity(row, col) {
  return String(row[col.name - 1]).trim() !== '' || String(row[col.phone - 1]).trim() !== '';
}

/* ------------------------------------------------------------------------
 * Công thức "Tổng hợp" miễn nhiễm chèn/xoá hàng (bản 2026-10-09).
 *
 * Nguyên nhân lỗi cũ: mỗi ô trỏ ô CỐ ĐỊNH (plango.korus.vn!A21). Khi tab nguồn bị
 * CHÈN hàng (kết nối Facebook ghi lead bằng cách chèn hàng mới), Google Sheets tự
 * dời mọi tham chiếu từ dòng đó trở xuống +1: dòng 21 của "Tổng hợp" chuyển sang
 * trỏ dòng 22 (đang trống) nên lead mới không hiện, phải kéo công thức bằng tay.
 *
 * Dạng mới: mọi ô đọc INDEX(plango.korus.vn!X:X, ROW()), tức "dòng N luôn hiện dòng N"
 * — cột nguyên (X:X) không bao giờ bị dời, nên lead hiện ngay, không cần script.
 * Riêng cột A còn bọc một NEO: IF(ROWS(plango.korus.vn!A21)=1, ..., ""). ROWS() của
 * một ô luôn bằng 1 nên neo không đổi kết quả hiển thị; nhưng Sheets vẫn dời neo
 * khi chèn/xoá hàng, nhờ vậy script biết cờ E ở dòng nào thuộc lead nào và
 * chuyển cờ theo lead (syncTongHop), không cần lưu thêm trạng thái hay sheet ẩn.
 * ---------------------------------------------------------------------- */

var LAST_FORMULA_ROW = 1000;
var ANCHOR_PATTERN = /^=\s*IF\(\s*ROWS\(([^()]*)\)\s*=\s*1\s*,\s*([\s\S]*?)\s*,\s*""\s*\)\s*$/i;

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Tên tab nguồn dùng trong công thức (thêm nháy đơn khi tên cần). */
function sourceSheetRef() {
  var name = leadSheetName();
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : "'" + name.replace(/'/g, "''") + "'";
}

/** Ô cố định của tab nguồn: plango.korus.vn!A21, 'plango.korus.vn'!$A$21. Nhóm 1 = cột, nhóm 2 = dòng. */
function sourceCellPattern(flags) {
  var name = escapeRegExp(leadSheetName().replace(/'/g, "''"));
  return new RegExp("(?:'" + name + "'|" + name + ")!\\$?([A-Z]{1,3})\\$?(\\d+)(?![\\d:])", flags || '');
}

/**
 * Dòng nguồn mà công thức cột A của một dòng "Tổng hợp" đang neo tới.
 * Trả số dòng; null khi dòng nguồn đã bị xoá (#REF!) hoặc ô không có công thức.
 * Dạng cũ (tham chiếu cố định, chưa có neo) dùng ô nguồn đầu tiên làm neo.
 */
function anchorRowOf(formula) {
  if (!formula) return null;
  var wrapped = ANCHOR_PATTERN.exec(formula);
  var m = sourceCellPattern().exec(wrapped ? wrapped[1] : formula);
  return m ? Number(m[2]) : null;
}

/** Bỏ neo, đổi mọi ô cố định của tab nguồn sang INDEX(cột, ROW()). null nếu không đổi được. */
function toRowRelative(formula) {
  if (!formula || formula.charAt(0) !== '=') return null;
  var wrapped = ANCHOR_PATTERN.exec(formula);
  var body = wrapped ? wrapped[2] : formula.slice(1);
  if (/#REF!/i.test(body)) return null;
  var sheetRef = sourceSheetRef();
  body = body.replace(sourceCellPattern('g'), function (all, column) {
    return 'INDEX(' + sheetRef + '!' + column + ':' + column + ', ROW())';
  });
  // Còn ô cố định (ví dụ vùng A2:Z2) thì không đổi tự động được: dừng, không đoán.
  if (sourceCellPattern().test(body) || /:\$?[A-Z]{1,3}\$?\d+/.test(body)) return null;
  return body;
}

/** Công thức chuẩn của một ô: cột A có neo trỏ đúng dòng nguồn cùng số. */
function canonicalFormula(base, row, isAnchorColumn) {
  return isAnchorColumn
    ? '=IF(ROWS(' + sourceSheetRef() + '!A' + row + ')=1, ' + base + ', "")'
    : '=' + base;
}

/** Ô đã ở dạng mới chưa (không còn ô nguồn cố định ngoài neo). */
function isRowRelative(formula, row, isAnchorColumn) {
  if (!formula) return false;
  var wrapped = ANCHOR_PATTERN.exec(formula);
  if (isAnchorColumn) {
    if (!wrapped || anchorRowOf(formula) !== row) return false;
    return !sourceCellPattern().test(wrapped[2]);
  }
  return !wrapped && !sourceCellPattern().test(formula);
}

function contiguousRuns(numbers) {
  var runs = [], run = [];
  numbers.forEach(function (n) {
    if (run.length && n === run[run.length - 1] + 1) run.push(n); else { if (run.length) runs.push(run); run = [n]; }
  });
  if (run.length) runs.push(run);
  return runs;
}

/**
 * Đưa "Tổng hợp" về trạng thái chuẩn, an toàn khi chạy lặp lại:
 *   1. Chuyển cờ E theo neo: lead đang neo dòng nguồn S thì cờ của nó về dòng S
 *      (lead bị xoá khỏi nguồn thì bỏ cờ; dòng nguồn không ai neo = lead mới,
 *      cờ FALSE). Ô E đang trống giữ trống.
 *   2. Viết lại công thức dạng mới cho dòng 2..LAST_FORMULA_ROW, neo dòng N = N.
 * Không đụng dòng có ô GÕ TAY trong các cột công thức (giữ nguyên cả cờ E).
 * force=false: chỉ ghi khi có dòng lệch/chưa chuẩn (trigger gọi mỗi lần).
 * Trả { ok, changed, remapped, skipped:[dòng], error }.
 */
function syncTongHop(tab, force) {
  var sheet = tab.sheet;
  var col = tab.col;
  var lastRow = Math.min(LAST_FORMULA_ROW, sheet.getMaxRows());
  var result = { ok: true, changed: false, remapped: 0, skipped: [], error: '' };
  if (lastRow < 2) return result;

  var formulaCols = [];
  for (var key in col) { if (key !== 'sent') formulaCols.push(col[key]); }
  formulaCols.sort(function (a, b) { return a - b; });

  var count = lastRow - 1;
  var width = sheet.getLastColumn();
  var range = sheet.getRange(2, 1, count, width);
  var formulas = range.getFormulas();
  var values = range.getValues();

  // Mẫu lấy từ dòng 2 (dạng cũ hay mới đều được); hỏng thì dừng, không ghi gì.
  var bases = {};
  for (var t = 0; t < formulaCols.length; t++) {
    var base = toRowRelative(formulas[0][formulaCols[t] - 1]);
    if (!base) {
      result.ok = false;
      result.error = 'tong_hop_template_invalid: cột ' + formulaCols[t] + ' dòng 2';
      return result;
    }
    bases[formulaCols[t]] = base;
  }

  var manual = {}, fixRows = [], hits = {}, needsWrite = !!force;
  for (var i = 0; i < count; i++) {
    var row = i + 2;
    var hasManual = formulaCols.some(function (c) {
      return !formulas[i][c - 1] && String(values[i][c - 1]).trim() !== '';
    });
    if (hasManual) { manual[row] = true; result.skipped.push(row); continue; }
    fixRows.push(row);

    var anchor = anchorRowOf(formulas[i][col.time - 1]);
    if (formulas[i][col.time - 1] && anchor !== row) result.remapped++;
    if (anchor !== null && values[i][col.sent - 1] === true) hits[anchor] = true;
    if (!needsWrite) {
      needsWrite = formulaCols.some(function (c) {
        return !isRowRelative(formulas[i][c - 1], row, c === col.time);
      });
    }
  }
  if (!needsWrite) return result;

  // 1. Cờ E theo neo. Ghi TRƯỚC công thức; công thức lỗi thì trả cờ cũ để lần sau chuyển lại đúng.
  var oldFlags = values.map(function (v) { return [v[col.sent - 1]]; });
  var newFlags = oldFlags.map(function (flag, index) {
    var row = index + 2;
    if (manual[row]) return [flag[0]];
    if (hits[row]) return [true];
    return [flag[0] === '' ? '' : false];
  });
  var flagsChanged = newFlags.some(function (flag, index) { return flag[0] !== oldFlags[index][0]; });
  var flagRange = sheet.getRange(2, col.sent, count, 1);
  if (flagsChanged) flagRange.setValues(newFlags);

  // 2. Công thức chuẩn, ghi theo khối dòng × khối cột liền nhau (bỏ cột E và dòng gõ tay).
  try {
    contiguousRuns(fixRows).forEach(function (rowsRun) {
      contiguousRuns(formulaCols).forEach(function (cols) {
        var block = rowsRun.map(function (row) {
          return cols.map(function (c) { return canonicalFormula(bases[c], row, c === col.time); });
        });
        sheet.getRange(rowsRun[0], cols[0], rowsRun.length, cols.length).setFormulas(block);
      });
    });
  } catch (error) {
    if (flagsChanged) { try { flagRange.setValues(oldFlags); } catch (ignored) {} }
    result.ok = false;
    result.error = 'tong_hop_sync_failed: ' + error;
    return result;
  }
  SpreadsheetApp.flush();
  result.changed = true;
  return result;
}

/**
 * CHẠY TAY: chuyển "Tổng hợp" sang công thức miễn nhiễm chèn/xoá hàng (dòng 2..1000)
 * và chuyển cờ E theo đúng lead. An toàn chạy lại; không xoá gì, không đụng dòng
 * gõ tay. Sau lần này guiMailLeadMoi tự làm việc tương tự mỗi khi phát hiện lệch.
 */
function suaCongThucTongHop() {
  var tab = openTongHop();
  if (!tab) { Logger.log('Không mở được "' + SHEET_TONG_HOP + '": ' + JSON.stringify(readLastMailStatus())); return; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) { Logger.log('Script đang bận (doPost/trigger). Chạy lại sau ít giây.'); return; }
  try {
    var sync = syncTongHop(tab, true);
    if (!sync.ok) { Logger.log('Dừng, không sửa gì: ' + sync.error); return; }
    Logger.log('Đã chuyển công thức dòng 2–' + Math.min(LAST_FORMULA_ROW, tab.sheet.getMaxRows()) +
               ' sang dạng INDEX(…, ROW()), không đụng cột cờ ngoài việc chuyển cờ theo lead (' +
               sync.remapped + ' dòng lệch neo). ' +
               (sync.skipped.length ? 'BỎ QUA ' + sync.skipped.length + ' dòng có dữ liệu gõ tay: ' + sync.skipped.slice(0, 20).join(',') : 'Không có dòng gõ tay.'));
  } finally {
    try { lock.releaseLock(); } catch (error) {}
  }
}

/** Gửi mail cho dòng chưa tick ở "Tổng hợp". Gọi qua trigger, KHÔNG gọi trong doPost. */
function guiMailLeadMoi() {
  if (!PropertiesService.getScriptProperties().getProperty(TONG_HOP_READY_PROPERTY)) {
    console.error('guiMailLeadMoi bỏ qua: chưa chạy danhDauLeadCuDaGui (tránh gửi mail cho lead cũ).');
    return;
  }

  var startedAt = Date.now();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) return;   // doPost hoặc lần chạy khác đang giữ; sự kiện sau sẽ quét lại
  try {
    var tab = openTongHop();
    if (!tab) return;

    // Có chèn/xoá hàng (neo lệch) hoặc dòng chưa có công thức chuẩn: chuyển cờ E theo
    // lead và viết lại công thức TRƯỚC khi đọc cờ, để không gửi trùng hay bỏ sót.
    // Fail-closed: không đồng bộ được thì dừng, báo qua lastMail, không gửi gì.
    var sync = syncTongHop(tab, false);
    if (!sync.ok) {
      console.error('guiMailLeadMoi dừng: ' + sync.error);
      recordLastMailStatus(false, sync.error);
      return;
    }
    SpreadsheetApp.flush();                      // để công thức "Tổng hợp" tính xong dòng mới

    var sheet = tab.sheet;
    var col = tab.col;
    var last = sheet.getLastRow();
    if (last < 2) return;

    var width = sheet.getLastColumn();
    var rows = sheet.getRange(2, 1, last - 1, width).getDisplayValues();
    var flags = sheet.getRange(2, col.sent, last - 1, 1).getValues();
    var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || NOTIFY_EMAIL_DEFAULT;
    var sent = 0;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (flags[i][0] === true || !hasLeadIdentity(row, col)) continue;

      var source = String(row[col.source - 1]).trim();
      if (source === '') continue;               // công thức chưa tính ra nguồn: chờ lần sau

      var sheetRow = i + 2;
      if (normalizeLabel(source) === SOURCE_HANDLED_BY_DOPOST) {
        sheet.getRange(sheetRow, col.sent).setValue(true);   // doPost đã báo: chỉ đánh dấu
        continue;
      }

      if (sent >= MAX_SHEET_MAILS_PER_RUN) break;
      if (!sendSheetLeadMail(to, row, col, source)) continue;   // lỗi: không tick, thử lại sau
      sheet.getRange(sheetRow, col.sent).setValue(true);
      sent++;
    }
    // Một dòng đo thời gian (không có dữ liệu lead) để xem ở Executions → Cloud logs.
    console.log('guiMailLeadMoi: ' + (Date.now() - startedAt) + ' ms, ' + rows.length + ' dòng, ' +
                (sync.changed ? 'đã đồng bộ lại công thức (' + sync.remapped + ' dòng lệch neo)' : 'công thức chuẩn') +
                ', gửi ' + sent + ' mail');
  } catch (error) {
    console.error('guiMailLeadMoi lỗi: ' + error);
    recordLastMailStatus(false, error);
  } finally {
    try { lock.releaseLock(); } catch (error) {}
  }
}

function sendSheetLeadMail(to, row, col, source) {
  try {
    var value = function (key) { return String(row[col[key] - 1]).trim(); };
    var mail = buildLeadMail({
      name:        value('name'),
      phone:       value('phone'),
      email:       value('email'),
      company:     value('company'),
      application: value('app'),
      message:     value('message'),
      time:        value('time'),
      sourceLabel: sourceDisplayName(source)
    }, null);
    MailApp.sendEmail({ to: to, subject: mail.subject, body: mail.body });
    recordLastMailStatus(true, '');
    return true;
  } catch (error) {
    // Không đưa nội dung lead vào log: chỉ ghi lỗi của MailApp.
    console.error('sendSheetLeadMail lỗi: ' + error);
    recordLastMailStatus(false, error);
    return false;
  }
}

/** Handler của trigger On change. Mọi thay đổi đều chạy được vì hàm idempotent nhờ cột cờ. */
function khiSheetThayDoi() {
  guiMailLeadMoi();
}

/**
 * CHẠY TAY ĐÚNG MỘT LẦN, TRƯỚC khi cài trigger: tick cột cờ cho mọi lead đang
 * có ở "Tổng hợp" để không gửi mail cho lead cũ, rồi mở khoá guiMailLeadMoi.
 * Chạy lại an toàn nhưng sẽ đánh dấu cả lead mới chưa kịp báo là "đã gửi".
 */
function danhDauLeadCuDaGui() {
  var tab = openTongHop();
  if (!tab) {
    Logger.log('Không mở được "' + SHEET_TONG_HOP + '": ' + JSON.stringify(readLastMailStatus()));
    return;
  }
  // Công thức phải chuẩn trước, nếu không cờ sẽ đánh vào dòng lệch.
  var sync = syncTongHop(tab, false);
  if (!sync.ok) {
    Logger.log('Dừng, chưa đánh dấu gì: ' + sync.error);
    return;
  }
  SpreadsheetApp.flush();
  var sheet = tab.sheet;
  var col = tab.col;
  var last = sheet.getLastRow();
  if (last >= 2) {
    var rows = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getDisplayValues();
    var current = sheet.getRange(2, col.sent, last - 1, 1).getValues();
    var ticks = rows.map(function (row, index) {
      return [hasLeadIdentity(row, col) ? true : current[index][0]];   // dòng trống giữ nguyên
    });
    sheet.getRange(2, col.sent, ticks.length, 1).setValues(ticks);
  }
  PropertiesService.getScriptProperties().setProperty(TONG_HOP_READY_PROPERTY, '1');
  Logger.log('Đã đánh dấu lead hiện có. Giờ chạy caiTriggerThongBao() để bật báo mail Facebook.');
}

/** Tạo trigger On change (xoá bản cũ cùng handler trước, để không nhân đôi). Chạy tay một lần. */
function caiTriggerThongBao() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'khiSheetThayDoi') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('khiSheetThayDoi')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();
  Logger.log('Đã cài trigger On change -> khiSheetThayDoi.');
}

/**
 * TUỲ CHỌN, chỉ cài khi test thấy On change bỏ sót lead Facebook: quét thưa
 * mỗi 10 phút làm lưới an toàn. Cùng hàm idempotent nên không gửi trùng.
 */
function caiTriggerDuPhong() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'guiMailLeadMoi') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('guiMailLeadMoi').timeBased().everyMinutes(10).create();
  Logger.log('Đã cài quét dự phòng mỗi 10 phút.');
}

/**
 * Ghi lead vào sheet. Trả { row } khi ghi mới, { row, duplicate: true } khi
 * idempotency key đã có. Ném lỗi nếu không ghi được.
 */
function writeLead(data) {
  var sheet = getLeadSheet();
  if (!sheet) throw new Error('lead_sheet_not_found: ' + leadSheetName());

  var header = ensureHeader(sheet);
  var existingRow = findExistingRow(sheet, header, String(data.idempotency_key || ''));
  if (existingRow > 0) return { row: existingRow, duplicate: true };

  sheet.appendRow(buildRow(header, data));

  // Dòng đã nằm trong sheet: từ đây không được ném lỗi.
  var writtenRow;
  try {
    writtenRow = sheet.getLastRow();
  } catch (error) {
    writtenRow = 0;
  }
  return { row: writtenRow, duplicate: false };
}

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    var data = readPayload(e);

    // Fail-closed: chưa cấu hình secret thì từ chối, không mặc định cho qua.
    // Hai nhánh từ chối dưới đây KHÔNG gửi mail, để không ai spam hộp thư được.
    var expected = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    var received = data.webhook_secret || '';
    if (!expected || received !== expected) return failure('unauthorized');

    if (!String(data.name || '').trim() || !String(data.phone || '').trim()) {
      return failure('missing_required_field');
    }

    // Không có lock thì hai lead vào cùng lúc cùng đọc một lastRow: một dòng
    // đè lên dòng kia, hoặc cả hai qua được vòng kiểm trùng.
    // busy không gửi mail: landing gửi lại cùng idempotency key ngay sau đó.
    if (!lock.tryLock(LOCK_TIMEOUT_MS)) return failure('busy');

    var written = null;
    var sheetError = null;
    try {
      written = writeLead(data);
    } catch (error) {
      sheetError = error;
      console.error('writeLead lỗi: ' + error);
    }

    // Đã ghi rồi (trùng idempotency): trả đúng số dòng cũ, không báo mail lại.
    if (written && written.duplicate) {
      return jsonOutput({ result: 'success', row: written.row });
    }

    // Mail không phụ thuộc sheet: ghi lỗi vẫn báo, kèm cảnh báo, để lead không mất.
    // notifyNewLead tự nuốt mọi lỗi.
    notifyNewLead(data, sheetError);

    if (sheetError) return failure(sheetError);
    if (!written.row) return jsonOutput({ ok: true });
    return jsonOutput({ result: 'success', row: written.row });

  } catch (error) {
    return failure(error);
  } finally {
    try { lock.releaseLock(); } catch (error) {}
  }
}

/**
 * Chạy tay một lần sau khi dán script, để kiểm mà không cần gửi lead thật.
 * Kỳ vọng log: {"result":"success","row":<số>} và sheet có đủ 9 cột.
 */
function kiemTraNhanh() {
  var secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!secret) {
    Logger.log('CHƯA đặt WEBHOOK_SECRET trong Script properties.');
    return;
  }

  var response = doPost({
    parameter: {
      webhook_secret:  secret,
      name:            'KIỂM TRA — xoá dòng này',
      phone:           '0900000000',
      company:         'Nhà máy may kiểm tra',
      application:     'tieu-chuan',
      email:           'kiemtra@example.com',
      message:         'Quy mô: 9 chuyền, 4 phân xưởng. Dòng do kiemTraNhanh() tạo.',
      consent_at:      new Date().toISOString(),
      idempotency_key: 'kiem-tra-' + Date.now()
    }
  });

  Logger.log(response.getContent());
  Logger.log('Nếu thấy {"result":"success","row":N} là đạt. Nhớ xoá dòng kiểm tra khỏi tab ' + leadSheetName() + '.');
  Logger.log('Kiểm tra hộp thư NOTIFY_EMAIL có mail "[PlanGo - Tự động] Lead mới: ...".');
  Logger.log('Trạng thái mail: ' + JSON.stringify(readLastMailStatus()));
}

/**
 * Chỉ kiểm phần gửi mail, không đụng sheet. Lần đầu chạy sẽ hỏi quyền gửi
 * mail: bấm Authorize. Log in hạn mức còn lại và lỗi nếu có.
 */
function kiemTraMail() {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || NOTIFY_EMAIL_DEFAULT;
  if (!to) { Logger.log('CHƯA đặt NOTIFY_EMAIL trong Script properties.'); return; }
  Logger.log('Gửi tới: ' + to + ' — hạn mức còn lại hôm nay: ' + MailApp.getRemainingDailyQuota());
  MailApp.sendEmail({
    to: to,
    subject: 'Kiểm tra mail báo lead từ ' + SITE_NAME,
    body: 'Mail do kiemTraMail() gửi. Nhận được là phần gửi mail hoạt động.'
  });
  Logger.log('Đã gửi. Không thấy trong Hộp thư đến thì xem cả Spam.');
}
