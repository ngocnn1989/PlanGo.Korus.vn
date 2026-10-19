/**
 * Webhook nhận lead từ landing VN-J và ghi vào Google Sheet.
 *
 * Triển khai: Extensions → Apps Script → dán toàn bộ file này → Deploy →
 * New deployment → Web app → Execute as: Me → Who has access: Anyone.
 * Rồi Project Settings → Script properties → thêm WEBHOOK_SECRET.
 * Hướng dẫn đầy đủ: docs/HUONG_DAN_DEPLOY_WELDBOT.md mục 9.
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
 * Bản này khác bản trước ở bốn điểm:
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
 */
var COLUMNS = [
  { key: '_timestamp',      label: 'Thời gian' },
  { key: 'name',            label: 'Họ tên' },
  { key: 'phone',           label: 'Số điện thoại' },
  { key: 'company',         label: 'Doanh nghiệp' },
  { key: 'application',     label: 'Nhóm ứng dụng' },
  { key: 'email',           label: 'Email' },
  { key: 'message',         label: 'Nội dung' },
  { key: 'consent_at',      label: 'Đồng ý lúc' },
  { key: 'idempotency_key', label: 'Idempotency Key' }
];

/** Đổi mã nhóm ứng dụng sang tiếng Việt cho người đọc sheet. */
var APPLICATION_LABELS = {
  'co-ban':                'Gói Cơ bản',
  'tieu-chuan':            'Gói Tiêu chuẩn',
  'nang-cao':              'Gói Nâng cao',
  'doanh-nghiep':          'Gói Doanh nghiệp',
  'other':                 'Bài toán khác',
  'undecided':             'Chưa xác định'
};

var SCRIPT_VERSION = '2026-09-10';
var MAX_CELL_LENGTH = 2000;
var LOCK_TIMEOUT_MS = 20000;

function jsonOutput(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Phản hồi lỗi. Không dùng dạng ack hợp lệ, để landing hiểu là thất bại thật. */
function failure(reason) {
  return jsonOutput({ ok: false, error: String(reason) });
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

/**
 * Đảm bảo hàng tiêu đề khớp COLUMNS.
 * Sheet trống thì tạo mới. Sheet đang chạy mà thiếu cột thì thêm vào cuối —
 * dữ liệu cũ giữ nguyên vị trí, không phải sửa tay.
 * Trả về mảng tên cột theo đúng thứ tự thật trong sheet.
 */
function ensureHeader(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (sheet.getLastRow() === 0 || lastColumn === 0) {
    var labels = COLUMNS.map(function (column) { return column.label; });
    sheet.appendRow(labels);
    sheet.getRange(1, 1, 1, labels.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return labels;
  }

  var header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(function (value) { return String(value).trim(); });

  var missing = COLUMNS
    .map(function (column) { return column.label; })
    .filter(function (label) { return header.indexOf(label) === -1; });

  if (missing.length > 0) {
    sheet.getRange(1, header.length + 1, 1, missing.length)
      .setValues([missing])
      .setFontWeight('bold');
    header = header.concat(missing);
  }

  return header;
}

/** Vị trí cột theo tên (1-based), 0 nếu không có. */
function columnIndex(header, key) {
  for (var i = 0; i < COLUMNS.length; i++) {
    if (COLUMNS[i].key === key) return header.indexOf(COLUMNS[i].label) + 1;
  }
  return 0;
}

/** Tìm dòng đã ghi cùng idempotency key. Trả số dòng, hoặc 0 nếu chưa có. */
function findExistingRow(sheet, header, idempotencyKey) {
  if (!idempotencyKey) return 0;
  var index = columnIndex(header, 'idempotency_key');
  if (index === 0) return 0;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var values = sheet.getRange(2, index, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === idempotencyKey) return i + 2;
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
  return header.map(function (label) {
    for (var i = 0; i < COLUMNS.length; i++) {
      if (COLUMNS[i].label === label) return byKey[COLUMNS[i].key];
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
 *   {"version":"2026-09-10","columns":9,...}  ← bản mới, có company + application
 *   Lỗi "Script function not found: doGet"        ← ĐANG CHẠY BẢN CŨ, phải deploy lại
 *
 * Không trả dữ liệu lead và không nhận secret, nên mở công khai vẫn an toàn.
 */
function doGet() {
  var labels = COLUMNS.map(function (column) { return column.label; });
  var hasSecret = !!PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');

  var sheetColumns = 0;
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheetColumns = sheet.getLastRow() === 0 ? 0 : sheet.getLastColumn();
  } catch (error) {
    sheetColumns = -1;
  }

  return jsonOutput({
    version: SCRIPT_VERSION,
    columns: labels.length,
    columnLabels: labels,
    sheetColumns: sheetColumns,
    secretConfigured: hasSecret
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    var data = readPayload(e);

    // Fail-closed: chưa cấu hình secret thì từ chối, không mặc định cho qua.
    var expected = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    var received = data.webhook_secret || '';
    if (!expected || received !== expected) return failure('unauthorized');

    if (!String(data.name || '').trim() || !String(data.phone || '').trim()) {
      return failure('missing_required_field');
    }

    // Không có lock thì hai lead vào cùng lúc cùng đọc một lastRow: một dòng
    // đè lên dòng kia, hoặc cả hai qua được vòng kiểm trùng.
    if (!lock.tryLock(LOCK_TIMEOUT_MS)) return failure('busy');

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var header = ensureHeader(sheet);
    var idempotencyKey = String(data.idempotency_key || '');

    var existingRow = findExistingRow(sheet, header, idempotencyKey);
    if (existingRow > 0) {
      // Đã ghi rồi: trả đúng số dòng cũ, không tạo dòng mới.
      return jsonOutput({ result: 'success', row: existingRow });
    }

    sheet.appendRow(buildRow(header, data));

    // Từ đây trở đi không được để xảy ra lỗi: dòng đã nằm trong sheet, nếu ném
    // lỗi thì khách thấy thất bại trong khi lead đã vào, rồi gửi lại lần nữa.
    var writtenRow;
    try {
      writtenRow = sheet.getLastRow();
    } catch (error) {
      return jsonOutput({ ok: true });
    }

    return jsonOutput({ result: 'success', row: writtenRow });

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
      company:         'Công ty kiểm tra',
      application:     'tieu-chuan',
      email:           'kiemtra@example.com',
      message:         'Dòng do kiemTraNhanh() tạo.',
      consent_at:      new Date().toISOString(),
      idempotency_key: 'kiem-tra-' + Date.now()
    }
  });

  Logger.log(response.getContent());
  Logger.log('Nếu thấy {"result":"success","row":N} là đạt. Nhớ xoá dòng kiểm tra khỏi sheet.');
}
