/**
 * Copy toàn trang landing PlanGo — nguồn chuẩn cho index.astro (G5).
 * Bản đọc duyệt cho owner: docs/plango_landing_copy.md (phải đồng bộ).
 *
 * Mọi câu khẳng định tính năng/lợi ích phải truy được về `plango-product.ts`
 * (mã claim ghi trong chú thích). Chạy `npm run legal` sau mỗi lần sửa.
 */
import { plangoProduct } from './plango-product';
import { plangoPricingNotes } from './plango-pricing';

export const plangoCopy = {
  header: {
    wordmark: 'PlanGo',
    tagline: 'Lập kế hoạch chuyền may',
    nav: [
      { label: 'Lợi ích', href: '#loi-ich' },
      { label: 'Cách hoạt động', href: '#cach-hoat-dong' },
      { label: 'Tính năng', href: '#tinh-nang' },
      { label: 'Bảng giá', href: '#bang-gia' },
      { label: 'Câu hỏi', href: '#hoi-dap' },
    ],
    cta: { label: 'Đặt lịch demo', labelMobile: 'Demo', href: '#tu-van' },
  },

  // S01 — Hero. Claims: b1, b3, s3, s6.
  hero: {
    eyebrow: 'Trợ lý AI lập kế hoạch sản xuất may',
    h1: 'Lập kế hoạch chuyền may trong một lệnh chat',
    body:
      'Đơn gấp chen ngang, chuyền thiếu người, khách hỏi ngày giao? PlanGo nhận đơn hàng từ Excel, tính 2–3 phương án kế hoạch cho cả nhà máy và cho bạn thấy tải từng chuyền trên một bảng Gantt — rút ngắn thời gian lập kế hoạch, tận dụng công suất các chuyền may.',
    ctaPrimary: { label: 'Đặt lịch demo', href: '#tu-van' },
    ctaSecondary: { label: 'Xem bảng giá', href: '#bang-gia' },
    microcopy: 'Giữ Excel quen thuộc · Số liệu do hệ thống tính · Dữ liệu lưu tại máy của nhà máy',
    imageAlt: 'Bảng Gantt tiến độ từng chuyền may trên PlanGo, dữ liệu minh họa',
  },

  // S01b — Lợi ích chính (owner yêu cầu 19/10/2026). Claims: b1–b4.
  loiIch: {
    anchor: 'loi-ich',
    label: 'Lợi ích',
    h2: 'Kế hoạch nhanh hơn, chuyền may chạy đều hơn',
    body: 'Bốn thay đổi PlanGo mang lại cho phòng kế hoạch và xưởng may — mỗi điểm dựa trên cách hệ thống tính toán, không dựa trên phỏng đoán.',
    items: plangoProduct.benefits,
    note: 'Mức hiệu quả cụ thể phụ thuộc dữ liệu và cách vận hành của từng nhà máy; KORUS cùng nhà máy đo trước và sau khi áp dụng.',
  },

  // S01c — Dành cho ai (đề xuất 4.2). Nguồn: project-overview-pdr (Người dùng chính), f1, f2, f4.
  danhChoAi: {
    anchor: 'danh-cho-ai',
    h2: 'Mỗi người trong nhà máy dùng PlanGo một cách',
    items: [
      { icon: 'chat', h3: 'Giám đốc sản xuất, phòng kế hoạch', body: 'Ra lệnh bằng chat, nhận 2–3 phương án, chọn và chốt kế hoạch.' },
      { icon: 'trend', h3: 'Chủ doanh nghiệp', body: 'Xem tải chuyền, rủi ro trễ hạn và báo cáo giải thích phương án.' },
      { icon: 'calendar', h3: 'Quản đốc, chuyền trưởng', body: 'Báo sản lượng và lao động có mặt bằng file, trên bảng tiến độ hoặc qua chat.' },
      { icon: 'layout', h3: 'Tổng công ty nhiều nhà máy', body: 'BCTĐ tháng theo mẫu chung, giữ công thức, báo rõ phần còn thiếu.' },
    ],
  },

  // S02 — Vấn đề.
  vanDe: {
    anchor: 'van-de',
    h2: 'Mỗi lần đơn đổi là một lần xếp lại từ đầu?',
    body: 'Khi đơn hàng, năng suất và lao động nằm ở nhiều bảng tính khác nhau, mỗi thay đổi nhỏ là một lần gom lại và tính lại bằng tay.',
    items: [
      { h3: 'Đơn gấp chen ngang', body: 'Một đơn mới làm lệch cả kế hoạch đang chạy.' },
      { h3: 'Lao động đổi theo ngày', body: 'Chuyền thiếu người, năng suất trên giấy không còn đúng.' },
      { h3: 'Khách hỏi ngày giao', body: 'Phải gọi xưởng, mở nhiều file mới trả lời được.' },
      { h3: 'Cuối tháng gom báo cáo', body: 'BCTĐ tổng hợp tay từ nhiều phân xưởng.' },
    ],
  },

  // S03 — Cách cũ · Cách mới (so sánh với chính cách làm thủ công). Claims: s2, s1, s6.
  cachCuCachMoi: {
    anchor: 'cach-cu-cach-moi',
    h2: 'Cách cũ · Cách mới',
    rows: [
      { old: 'Gom file Excel bằng tay', next: 'Nhập Excel có kiểm duyệt, xác nhận rồi mới lưu' },
      { old: 'Đoán chuyền nào còn rảnh', next: 'Gantt từng chuyền, thấy ngay khoảng trống và quá tải' },
      { old: 'Tính tay từng phương án', next: 'Hệ thống tính 2–3 phương án, bạn chọn' },
      { old: 'Phát hiện trễ hạn khi đã muộn', next: 'Cảnh báo xung đột tải và rủi ro trễ hạn giao' },
      { old: 'Xếp chuyền rồi mới biết vải chưa về', next: 'Đơn chỉ được xếp từ ngày vải, phụ liệu, tài liệu mẫu sẵn sàng' },
      { old: 'Gọi xưởng hỏi chuyền nào sắp trống', next: 'Ngày nhả chuyền do hệ thống tính từ phần việc còn lại và năng suất' },
    ],
  },

  // S04 — Cách hoạt động. Claims: s2, s3, f3.
  cachHoatDong: {
    anchor: 'cach-hoat-dong',
    h2: 'Ba bước, ngay trong khung chat',
    body: 'Giám đốc sản xuất trao đổi với trợ lý AI như với một nhân viên kế hoạch; mọi con số do hệ thống PlanGo tính.',
    steps: [
      {
        step: 'Bước 1',
        title: 'Nhập đơn hàng từ Excel',
        body: 'Gửi file đơn hàng theo mẫu quen thuộc. PlanGo kiểm tra cột, ngày tháng, dữ liệu thiếu và cho bạn xem trước trước khi lưu.',
      },
      {
        step: 'Bước 2',
        title: 'Chọn phương án kế hoạch',
        body: 'Gõ "Lập kế hoạch tháng 11 cho xưởng". Hệ thống trả về 2–3 phương án đã chấm điểm kèm phương án được đề xuất.',
      },
      {
        step: 'Bước 3',
        title: 'Xác nhận rồi mới lưu',
        body: 'Duyệt phương án, Gantt từng chuyền cập nhật ngay; xuất kế hoạch sản xuất ra Excel để gửi xưởng.',
      },
    ],
    cta: { label: 'Xem demo trên dữ liệu mẫu', href: '#tu-van' },
  },

  // S04b — Bộ tối ưu (làm rõ lợi ích b2/b3). Claims: b2, b3.
  toiUu: {
    anchor: 'toi-uu',
    h2: 'Mỗi phương án được chấm điểm theo 6 tiêu chí',
    body: 'PlanGo xếp đơn hàng vào chuyền theo công suất thực có — năng suất nhân lao động hiệu dụng — rồi so các phương án bằng cùng một thang điểm.',
    criteria: plangoProduct.scoringCriteria,
    goalsTitle: 'Chọn hướng phù hợp với tình hình xưởng',
    goals: plangoProduct.planningGoals,
    note: 'Đơn đang chạy và kế hoạch đã chốt được giữ nguyên; phương án mới chỉ được lưu khi bạn xác nhận.',
    overtimeNote: 'Hướng A ưu tiên giữ một đơn trên một chuyền. Hướng C có thể đề xuất tăng ca ngắn ở phần cuối đơn, trong giới hạn giờ bạn đặt trước.',
  },

  // S04c — Khi xưởng có biến động (đề xuất 4.7). Claims: s3, s6, f13, f10, f4, s1, f11.
  bienDong: {
    anchor: 'bien-dong',
    h2: 'Khi xưởng có biến động',
    body: 'Những tình huống phòng kế hoạch gặp hằng tuần — và PlanGo xử lý ra sao.',
    items: [
      { h3: 'Đơn gấp chen ngang', body: 'Yêu cầu lập kế hoạch lại: hệ thống tính 2–3 phương án có tính tới việc đang chạy; kế hoạch đã chốt được giữ, chỉ lưu khi bạn xác nhận.' },
      { h3: 'Thiếu người một chuyền', body: 'Nhập lao động thực tế của ngày; công suất và dự báo của chuyền đó tính lại theo số người có mặt.' },
      { h3: 'Vải, phụ liệu về trễ', body: 'Đơn không được xếp bắt đầu trước ngày vải, phụ liệu sẵn sàng; báo cáo rà soát gợi ý đổi thứ tự, dồn hoặc chia chuyền.' },
      { h3: 'Khách hỏi ngày giao', body: 'Xem ngày hoàn thành dự kiến và cảnh báo trễ hạn của từng đơn ngay trên Gantt.' },
    ],
  },

  // S05 — Tính năng. Claims: s1, s4, s5, f1, f2, f3, f4, f5.
  tinhNang: {
    anchor: 'tinh-nang',
    h2: 'Đủ công cụ cho một vòng kế hoạch — tiến độ',
    groups: [
      { title: 'Lập kế hoạch', claims: ['f13', 'f9', 'f10', 's5'] },
      { title: 'Theo dõi', claims: ['s1', 'f11', 'f1', 'f5'] },
      { title: 'Báo cáo', claims: ['f3', 'f2', 'f4', 'f6'] },
    ],
    items: [
      { claim: 'f13', h3: 'Công suất theo lao động từng ngày', body: 'Công suất = năng suất × lao động có mặt của từng chuyền, nhập theo ngày.' },
      { claim: 'f9', h3: 'Lịch làm việc, ngày nghỉ', body: 'Ngày hoàn thành tính theo đúng lịch của phân xưởng và chuyền.' },
      { claim: 'f10', h3: 'Chờ vải, phụ liệu sẵn sàng', body: 'Đơn không được xếp bắt đầu trước ngày vải, phụ liệu, tài liệu mẫu sẵn sàng.' },
      { claim: 'f11', h3: 'Ngày nhả chuyền tự tính', body: 'Tính từ phần việc còn lại và năng suất; chuyền thiếu dữ liệu không nhận đơn mới.' },
      { claim: 'f6', h3: 'Bổ sung đơn, chuyển lô', body: 'Bổ sung đơn hàng, tách hoặc chuyển lô có xem trước và xác nhận.' },
      { claim: 's1', h3: 'Gantt theo từng chuyền', body: 'Thanh kế hoạch theo chuyền, tách phần thực tế và phần dự báo.' },
      { claim: 's5', h3: 'Báo xung đột tải chuyền', body: 'Phát hiện chuyền bị xếp chồng việc trước khi kế hoạch được lưu.' },
      { claim: 'f1', h3: 'Sản lượng qua 3 kênh', body: 'Gửi file BCTĐ, nhập trên bảng tiến độ hoặc nhắn qua chat; theo dõi chênh lệch kế hoạch — thực tế.' },
      { claim: 'f2', h3: 'Báo cáo tiến độ tháng (BCTĐ)', body: 'Nhập và xuất BCTĐ theo phân xưởng, có bước xem trước trước khi ghi.' },
      { claim: 'f3', h3: 'Xuất KHSX ra Excel', body: 'Kế hoạch sản xuất xuất theo mẫu Excel của nhà máy.' },
      { claim: 'f5', h3: 'Bảng tiến độ toàn nhà máy', body: 'Xem theo nhà máy, phân xưởng, chuyền với các chỉ số KPI chính.' },
      { claim: 'f4', h3: 'Báo cáo rà soát rủi ro', body: 'Khi có biến động, nhận báo cáo rủi ro và gợi ý phương án điều chỉnh.' },
    ],
    imageAlt: 'Bảng tiến độ PlanGo theo phân xưởng và chuyền, dữ liệu minh họa',
  },

  // S06 — Tin cậy & an toàn dữ liệu. Claims: s6, s7, s2, f7.
  tinCay: {
    anchor: 'an-toan-du-lieu',
    h2: 'Dữ liệu của nhà máy ở lại nhà máy',
    items: [
      { h3: 'Lưu trên máy tại nhà máy', body: 'Cơ sở dữ liệu kế hoạch và tiến độ nằm trên máy tính của xưởng, không lưu trên máy chủ của KORUS.' },
      { h3: 'Hệ thống tính, AI không đoán số', body: 'AI chỉ điều phối, hỏi lại và giải thích; mọi con số do bộ tính toán của PlanGo xử lý.' },
      { h3: 'Xem trước, xác nhận rồi mới ghi', body: 'Nhập đơn, nhập tiến độ, đổi kế hoạch đều qua bước xem trước và xác nhận.' },
      { h3: 'Bản quyền theo máy', body: 'Phần mềm kiểm tra bản quyền và tính toàn vẹn mỗi khi chạy.' },
      { h3: 'Nâng cấp không mất dữ liệu', body: 'Bản cập nhật tự sao lưu cơ sở dữ liệu trước khi cài; thay đổi dữ liệu đặc biệt phải được xác nhận.' },
    ],
  },

  // S07 — Bảng giá. Nguồn: plango-pricing.ts (D-01).
  bangGia: {
    anchor: 'bang-gia',
    label: 'Bảng giá',
    h2: 'Chọn gói theo số chuyền của nhà máy',
    body: 'Phí thuê bao theo tháng cộng phí triển khai một lần. Thêm chuyền ngoài hạn mức tính thêm theo tháng.',
    fromLabel: 'Từ',
    perMonth: '/tháng',
    setupLabel: 'Triển khai một lần từ',
    linesLabel: 'Số chuyền',
    workshopsLabel: 'Phân xưởng',
    machinesLabel: 'Máy cài đặt',
    supportLabel: 'Hỗ trợ',
    extraLineLabel: 'Thêm chuyền',
    popularLabel: 'Phù hợp nhà máy vừa',
    contactPrice: 'Báo giá riêng',
    matrixTitle: 'So sánh chức năng',
    estimator: {
      title: 'Ước tính nhanh',
      linesLabel: 'Số chuyền may',
      workshopsLabel: 'Số phân xưởng',
      resultLabel: 'Gói gợi ý',
      feeLabel: 'Phí thuê bao tham khảo',
      cta: 'Nhận báo giá chi tiết',
    },
    notes: plangoPricingNotes,
  },

  // S08 — Lộ trình triển khai.
  loTrinh: {
    anchor: 'trien-khai',
    h2: 'Triển khai tại nhà máy',
    body: 'KORUS cùng phòng kế hoạch đi từng bước, dùng chính file Excel nhà máy đang có.',
    steps: [
      { step: 'Bước 1', title: 'Khảo sát', body: 'Tìm hiểu cơ cấu phân xưởng, chuyền, mẫu đơn hàng và báo cáo hiện tại.' },
      { step: 'Bước 2', title: 'Cài đặt và khai báo', body: 'Cài PlanGo trên máy của nhà máy, khai báo phân xưởng, chuyền, lịch làm việc, năng suất.' },
      { step: 'Bước 3', title: 'Chạy thử dữ liệu thật', body: 'Nhập đơn hàng và tiến độ hiện có, đối chiếu kế hoạch với cách làm cũ.' },
      { step: 'Bước 4', title: 'Đào tạo và vận hành', body: 'Hướng dẫn giám đốc sản xuất, quản đốc thao tác hằng ngày; hỗ trợ trong quá trình chạy.' },
    ],
    cta: { label: 'Đặt lịch khảo sát', href: '#tu-van' },
  },

  // S10 — FAQ.
  faq: {
    anchor: 'hoi-dap',
    h2: 'Câu hỏi thường gặp',
    items: [
      {
        q: 'Nhà máy có phải bỏ Excel không?',
        a: 'Không. PlanGo nhận đơn hàng và tiến độ từ Excel, xuất kế hoạch và báo cáo ra Excel theo mẫu của nhà máy.',
      },
      {
        q: 'Dữ liệu của nhà máy được lưu ở đâu?',
        a: 'Cơ sở dữ liệu của PlanGo nằm trên máy tính đặt tại nhà máy, không lưu trên máy chủ của KORUS. Nội dung bạn trao đổi trong khung chat đi qua nhà cung cấp trợ lý AI mà nhà máy sử dụng.',
      },
      {
        q: 'PlanGo rút ngắn thời gian lập kế hoạch bằng cách nào?',
        a: 'Thay vì gom file và tính tay, bạn ra một lệnh chat; hệ thống tự xếp đơn vào chuyền theo công suất thực có và trả về 2–3 phương án đã chấm điểm để chọn.',
      },
      {
        q: 'Làm sao PlanGo giúp tận dụng công suất chuyền?',
        a: 'Công suất từng chuyền được tính từ năng suất và lao động hiệu dụng. Bộ tối ưu trừ điểm những phương án để chuyền nằm chờ việc hoặc dồn tăng ca, và Gantt cho thấy khoảng trống để xếp thêm việc.',
      },
      {
        q: 'AI có tự quyết định kế hoạch không?',
        a: 'Không. AI điều phối, hỏi lại khi thiếu dữ liệu và giải thích phương án. Con số do hệ thống tính, kế hoạch chỉ được lưu khi bạn xác nhận.',
      },
      {
        q: 'Đơn gấp chen ngang thì làm thế nào?',
        a: 'Nhập đơn rồi yêu cầu lập kế hoạch; hệ thống tính 2–3 phương án có tính tới việc đang chạy. Phương án chỉ được lưu khi bạn chọn và xác nhận.',
      },
      {
        q: 'Chuyền thiếu người đột xuất thì kế hoạch có tính lại không?',
        a: 'Bạn nhập lao động thực tế của ngày trên bảng tiến độ hoặc qua chat; công suất và dự báo của chuyền tính lại theo số người đó. Muốn xếp lại kế hoạch, bạn yêu cầu phương án mới và xác nhận trước khi lưu.',
      },
      {
        q: 'Nhà máy chưa có ERP có dùng được không?',
        a: 'Được. PlanGo làm việc trực tiếp với file Excel đơn hàng và BCTĐ của nhà máy; ngoài máy tính Windows và tài khoản trợ lý AI, không cần ERP hay hệ thống khác.',
      },
      {
        q: 'Có báo cáo để trình lãnh đạo không?',
        a: 'Có: báo cáo giải thích phương án kế hoạch và báo cáo rà soát rủi ro dạng Word, cùng KHSX và BCTĐ dạng Excel.',
      },
      {
        q: 'Cần máy tính và phần mềm gì?',
        a: 'Một máy tính Windows tại nhà máy và tài khoản trợ lý AI (Codex hoặc Antigravity). KORUS hướng dẫn chuẩn bị trong bước khảo sát.',
      },
      {
        q: 'Nhà máy tăng thêm chuyền thì tính phí thế nào?',
        a: 'Mỗi chuyền ngoài hạn mức của gói tính thêm theo tháng; khi vượt hẳn hạn mức, nhà máy chuyển lên gói kế tiếp.',
      },
      {
        q: 'Có xem thử trước khi quyết định không?',
        a: 'Có. KORUS sắp xếp buổi demo trên dữ liệu mẫu, hoặc trên file Excel của nhà máy nếu bạn muốn.',
      },
    ],
  },

  // S11 — Liên hệ: nội dung form nằm ở landing-contact.ts (G5 cập nhật).
  lienHe: {
    anchor: 'tu-van',
    h2: 'Đặt lịch demo PlanGo',
    body: 'Để lại thông tin và quy mô nhà máy. KORUS liên hệ để sắp xếp buổi demo và gửi báo giá theo số chuyền.',
    hotlineLabel: 'Hotline',
    zaloLabel: 'Zalo',
  },

  footer: {
    name: 'PlanGo',
    legalName: 'Công ty Cổ phần Công nghệ KORUS',
    website: 'PlanGo.korus.vn',
    note: 'PlanGo là phần mềm do Công ty Cổ phần Công nghệ KORUS phát triển và giữ bản quyền.',
  },
} as const;

export type PlanGoCopy = typeof plangoCopy;
