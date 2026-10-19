/** Landing copy: concise Vietnamese, sourced claims, one primary CTA. */

import { airobotProduct } from './airobot-product';
import { landingContact } from './landing-contact';
import siteProfile from '../config/site-profile.mjs';

// Số hotline lấy từ site profile (nguồn duy nhất), không viết cứng.
const phoneProfile = siteProfile.contact?.phone;
const phoneRaw = (phoneProfile?.enabled && phoneProfile.raw) || '';
const phoneDisplay = (phoneProfile?.enabled && (phoneProfile.display || phoneProfile.raw)) || '';


const landingCopySource = {
  /** S00 — Header */
  header: {
    wordmark: 'VN-J',
    tagline: 'Giải pháp robot hàn từ VN-J',
    nav: [
      { label: 'Hệ thống', href: '#he-thong' },
      { label: 'Ứng dụng', href: '#ung-dung' },
      { label: 'Về VN-J', href: '#ve-vnj' },
    ],
    hotline: {
      label: `Hotline VN-J: ${phoneDisplay}`,
      display: phoneDisplay,
      href: `tel:${phoneRaw}`,
    },
    // Nhãn CTA toàn trang. Đổi ở đây thì phải đổi đồng bộ cả sáu chỗ:
    // header.cta, hero.ctaPrimary, dieuKien.cta, veVnj.cta, loTrinh.cta,
    // lienHe.formTitle — cộng bảng CTA §16 trong docs/novabot_landing.md.
    // Nhãn là cụm danh từ: nói cái người dùng nhận được, không kể ai làm gì.
    cta: {
      label: 'Nhận tư vấn AiRobot',
      labelMobile: 'Nhận tư vấn',
      href: '#tu-van',
    },
  },

  /** S01 — Hero */
  hero: {
    eyebrow: 'THIẾT KẾ VÀ CHẾ TẠO BỞI VN-J',
    h1: 'AiRobot — Trạm robot hàn tự động trên ray',
    body: 'Giải pháp robot hàn thông minh cho đóng tàu, kết cấu thép và cơ khí chế tạo. Tích hợp quét phôi tự động, camera AI scan 3D, nhận dạng đường hàn bằng laser và HMI tiếng Việt.',
    ctaPrimary: { label: 'Nhận tư vấn AiRobot', href: '#tu-van' },
    // Nút này dẫn tới S03 — nơi đặt hình minh họa trong bộ tư liệu sản phẩm,
    // KHÔNG phải ảnh chụp hiện trường. Nhãn cũ "Xem hệ thống thực tế" hứa sai
    // thứ được giao; giữ nhãn nói đúng cái người xem sẽ thấy.
    ctaSecondary: { label: 'Xem cấu tạo hệ robot', href: '#he-thong' },
    microcopy: 'Bắt đầu bằng mô tả ngắn nhu cầu. Chưa cần gửi bản vẽ.',
    imageAlt: 'Hình minh họa cụm đầu hàn, cổ tay và dây dẫn của hệ robot với nhãn VN-J.',
  },

  /** S02 — Nền tảng VN-J */
  nenTang: {
    anchor: 'nen-tang-vnj',
    label: 'NỀN TẢNG CHẾ TẠO MÁY CỦA VN-J',
    stats: [
      {
        value: 'Thành lập năm 2012',
        note: 'Nền tảng cơ khí và tự động hóa công nghiệp',
      },
      {
        value: '1.250+ dự án',
        note: 'Dự án trên các lĩnh vực hoạt động của VN-J',
      },
      {
        value: 'Việt Nam · Nhật Bản · Ấn Độ',
        note: 'Thị trường hoạt động của VN-J. Máy cắt laser do doanh nghiệp chế tạo đã xuất khẩu sang Nhật Bản.',
      },
    ],
    /** Bản thay thế khi chưa sử dụng được số liệu. Không hiển thị đồng thời với stats. */
    banThayThe: {
      title: 'VN-J — doanh nghiệp cơ khí trong lĩnh vực chế tạo máy cắt laser',
      body: 'Nền tảng chế tạo máy cắt laser công suất lớn cũng là nơi ra đời trạm robot hàn AiRobot.',
      link: { label: 'Tìm hiểu về VN-J', href: '#ve-vnj' },
    },
  },

  /** S03 — Hệ robot thực tế */
  heThong: {
    anchor: 'he-thong',
    h2: 'AiRobot gồm những gì và hoạt động ra sao?',
    body: 'AiRobot tích hợp robot hàn, camera AI scan 3D và phần mềm điều khiển trong một trạm. Từ dữ liệu quét phôi, hệ thống xác định đường hàn, đề xuất quỹ đạo và thực hiện hàn theo chương trình.',
    components: airobotProduct.components,
    // Ảnh trong bộ tư liệu là ảnh dựng, không phải ảnh chụp hiện trường.
    // Nhãn phải khớp hero (đã ghi "Hình minh họa") — xem docs/novabot_landing.md §7, §18.
    caption: 'Hình minh họa hệ robot trong bộ tư liệu sản phẩm.',
    diemDocNhanh: airobotProduct.features,
    link: { label: 'Xem các nhóm ứng dụng', href: '#ung-dung' },
    imageAltChinhDien:
      'Hình minh họa hệ robot hàn trên ray với cánh tay vàng, nguồn hàn xanh và tủ điều khiển tại khu trưng bày.',
    imageAltGocBaPhanTu:
      'Hình minh họa cụm đầu hàn, cánh tay robot và thiết bị trên ray nhìn từ góc ba phần tư.',
    /**
     * Thông số có nguồn — docs/novabot_product_facts.md §2–§4, chỉ các dòng ✅.
     * Quy ước đơn vị: số và đơn vị cách nhau một khoảng trắng (`380 V`, `70 kW`),
     * gạch chéo không khoảng trắng (`MIG/MAG`), khoảng giá trị dùng gạch ngang
     * không khoảng trắng (`6–25 mm`).
     */
    cauHinhThamChieu: {
      title: airobotProduct.referenceTitle,
      items: airobotProduct.specifications,
      note: airobotProduct.referenceNote,
    },
  },

  /** S04 — Một hệ robot, ba nhóm ứng dụng */
  ungDung: {
    anchor: 'ung-dung',
    h2: 'Ứng dụng AiRobot trong sản xuất cơ khí',
    body: 'Ba nhóm nhu cầu để bắt đầu lựa chọn công đoạn hàn tự động. Phạm vi thực hiện gắn với chi tiết và cấu hình cụ thể.',
    cards: [
      {
        slug: 'shipbuilding',
        h3: 'Đóng tàu & kết cấu lớn',
        body: 'Hàn các cụm kết cấu trong chế tạo tàu và thiết bị công nghiệp. Ray di chuyển phục vụ việc tiếp cận các vị trí hàn dọc cấu kiện.',
        listLabel: 'Yêu cầu ứng dụng',
        list: [
          'Kích thước cấu kiện và vị trí đường hàn.',
          'Điều kiện gá đặt, di chuyển và tiếp cận.',
          'Yêu cầu kiểm tra, nghiệm thu của dự án.',
        ],
        cta: { label: 'Tư vấn cấu kiện đóng tàu', href: '#tu-van' },
        imageAlt: 'Hình minh họa hệ robot hàn VN-J trong bối cảnh chế tạo cấu kiện đóng tàu.',
      },
      {
        slug: 'structural-steel',
        h3: 'Kết cấu thép',
        body: 'Hướng ứng dụng cho các cấu kiện kết cấu thép có công đoạn hàn lặp lại. Phương án tính đến hình học đường hàn, gá đặt và sản lượng theo lô.',
        listLabel: 'Yêu cầu ứng dụng',
        list: [
          'Vật liệu, chiều dày và nhóm chi tiết.',
          'Sản lượng, chu kỳ hiện tại và mục tiêu.',
          'Phương án gá và tần suất đổi mã.',
        ],
        cta: { label: 'Tư vấn kết cấu thép', href: '#tu-van' },
        imageAlt: 'Hình minh họa hệ robot hàn VN-J trong xưởng gia công kết cấu thép.',
      },
      {
        slug: 'precision-fabrication',
        h3: 'Chi tiết cơ khí theo lô',
        body: 'Tự động hóa công đoạn hàn cho nhóm chi tiết có hình học tương đồng. Thời gian lập trình, gá đặt và đổi mã cần được tính trong chu kỳ sản xuất.',
        listLabel: 'Yêu cầu ứng dụng',
        list: [
          'Bản vẽ và dung sai cần kiểm soát.',
          'Yêu cầu biến dạng và công đoạn sau hàn.',
          'Tiêu chí kiểm tra của chi tiết hoàn thiện.',
        ],
        cta: { label: 'Tư vấn hàn chi tiết theo lô', href: '#tu-van' },
        imageAlt: 'Hình minh họa hệ robot hàn VN-J trong xưởng cơ khí quy mô vừa.',
      },
    ],
    // Câu thận trọng duy nhất của S04, đặt cuối section.
    footnote:
      'Hình ảnh chỉ minh họa bối cảnh ứng dụng. Phương án cụ thể đi theo yêu cầu kỹ thuật và điều kiện sản xuất của từng xưởng.',
  },

  /** S05 — Điều kiện ứng dụng và vận hành */
  dieuKien: {
    anchor: 'danh-gia-ky-thuat',
    h2: 'Điều kiện ứng dụng AiRobot tại nhà xưởng',
    body: 'Năm yếu tố cần xác định khi lựa chọn công đoạn hàn tự động: đường hàn, phôi, đổi mã, chu kỳ và bảo dưỡng.',
    items: [
      {
        h3: 'Tiếp cận đường hàn',
        body: 'Kiểm tra vị trí đường hàn, không gian tiếp cận và cách bố trí hệ thống. Không suy ra khả năng hàn chỉ từ chiều dài ray.',
      },
      {
        h3: 'Phôi và gá đặt',
        body: 'Độ ổn định của phôi, phương án gá và sai lệch đầu vào quyết định mức chỉnh tay giữa các lô.',
      },
      {
        h3: 'Lập trình và đổi mã',
        body: 'Số mã hàng, tần suất đổi mã và phần việc của đội vận hành mỗi lần chuyển sang chi tiết mới.',
      },
      {
        h3: 'Chất lượng và chu kỳ tổng',
        body: 'Tiêu chí kiểm tra mối hàn và chi tiết sau hàn. Khi tính năng lực sản xuất, cộng cả thời gian gá, tháo phôi và thao tác phụ.',
      },
      {
        h3: 'Bảo dưỡng và hỗ trợ',
        body: 'Phương án thống nhất ghi rõ vật tư tiêu hao, lịch bảo dưỡng, đầu mối hỗ trợ và trách nhiệm mỗi bên.',
      },
    ],
    cauChuyen:
      'Mô tả công đoạn cần tự động hóa để trao đổi cấu hình và điều kiện ứng dụng.',
    cta: { label: 'Nhận tư vấn AiRobot', href: '#tu-van' },
    imageAlt: 'Hình minh họa hệ robot hàn trên ray màu vàng–xanh với nhãn VN-J trên tủ máy.',
    imageAltThayThe:
      'Hình minh họa tủ điều khiển, nguồn hàn và thiết bị phụ trợ của hệ robot VN-J.',
  },

  /** S07 — Năng lực doanh nghiệp VN-J */
  veVnj: {
    anchor: 've-vnj',
    h2: 'VN-J — Đơn vị thiết kế và chế tạo AiRobot',
    gioiThieu:
      'VN-J hoạt động trong lĩnh vực cơ khí và tự động hóa công nghiệp từ năm 2012. Trạm robot hàn AiRobot được phát triển từ nền tảng thiết kế, chế tạo máy của doanh nghiệp.',
    /** Bản thay thế khi chưa sử dụng số liệu; các đoạn còn lại giữ nguyên. */
    gioiThieuThayThe:
      'VN-J hoạt động trong lĩnh vực cơ khí và sản xuất máy cắt laser công suất lớn.',
    ketNoi:
      'Gọi thẳng hotline để trao đổi về chi tiết cần gia công, điều kiện nhà xưởng và yêu cầu sản xuất.',
    cauNhan:
      'Phạm vi cung cấp, đào tạo và hỗ trợ được thể hiện trong đề xuất cho từng dự án.',
    cta: { label: 'Nhận tư vấn AiRobot', href: '#tu-van' },
  },

  /** S08 — Lộ trình đánh giá và triển khai */
  loTrinh: {
    anchor: 'quy-trinh',
    h2: 'Từ nhu cầu sản xuất đến phương án triển khai',
    body: 'Từ thông tin chi tiết cần hàn đến cấu hình, cách kiểm chứng và phạm vi triển khai.',
    steps: [
      {
        step: 'Bước 1',
        title: 'Chi tiết cần hàn',
        body: 'Ảnh hoặc thông tin sản phẩm, vật liệu, kích thước, yêu cầu đầu ra và sản lượng mục tiêu.',
      },
      {
        step: 'Bước 2',
        title: 'Phương án và điều kiện áp dụng',
        body: 'Vùng làm việc, gá đặt, mặt bằng, thao tác vận hành và các hạng mục phải đưa vào phương án.',
      },
      {
        step: 'Bước 3',
        title: 'Cách đánh giá',
        body: 'Thống nhất tiêu chí kiểm tra và nhu cầu chạy thử hoặc mô phỏng theo từng chi tiết.',
      },
      {
        step: 'Bước 4',
        title: 'Triển khai và hỗ trợ',
        body: 'Đề xuất hoặc hợp đồng ghi rõ cấu hình, phạm vi cung cấp, tiến độ, đào tạo, bảo hành và trách nhiệm hỗ trợ.',
      },
    ],
    cta: { label: 'Nhận tư vấn AiRobot', href: '#tu-van' },
  },

  /** S09 — FAQ */
  faq: {
    anchor: 'cau-hoi',
    h2: 'Câu hỏi thường gặp về robot hàn AiRobot',
    items: [
      {
        q: 'Làm sao biết chi tiết của xưởng phù hợp với hệ robot này?',
        a: 'Ảnh hoặc bản vẽ, vật liệu, chiều dày và vị trí đường hàn là cơ sở xác định hướng ứng dụng. Khả năng đáp ứng được đánh giá cùng phương án gá và tiêu chí kiểm tra.',
      },
      {
        q: 'Xưởng thường xuyên đổi mã hàng có thể ứng dụng không?',
        a: 'Yếu tố quyết định là số mã hàng, mức giống nhau giữa các chi tiết, tần suất đổi mã và sản lượng mỗi lô. Phương án tính luôn thời gian chuẩn bị, lập trình và gá đặt cho nhóm sản phẩm thật của xưởng.',
      },
      {
        q: 'Hệ thống hàn được những vật liệu và chiều dày nào?',
        a: 'Cấu hình tham chiếu sử dụng MIG/MAG, với chiều dày vật liệu công bố 6–25 mm. Loại vật liệu và dạng liên kết cần được xác định theo chi tiết thực tế trước khi chọn cấu hình.',
      },
      {
        q: 'Kiểm tra chất lượng mối hàn và dung sai sau hàn thế nào?',
        a: 'Tiêu chí đầu ra của chi tiết và cách kiểm tra do hai bên thống nhất. Độ lặp lại chuyển động của robot chỉ là một yếu tố; phôi, gá đặt và quy trình cũng quyết định kích thước sau hàn.',
      },
      {
        q: 'Có thể xem AiRobot vận hành hoặc trao đổi về chạy thử không?',
        a: 'Nêu rõ mong muốn xem hệ thống hay đánh giá một chi tiết cụ thể khi liên hệ. Địa điểm, mẫu thử và phạm vi thực hiện chốt theo từng yêu cầu.',
      },
      {
        q: 'Cần chuẩn bị gì về mặt bằng và đội vận hành?',
        a: 'Cần chuẩn bị vị trí lắp đặt dự kiến, không gian thao tác, cách đưa phôi vào công đoạn và đội sẽ vận hành máy. Yêu cầu hạ tầng, an toàn và đào tạo đi theo phương án cụ thể.',
      },
      {
        q: 'Giá bao nhiêu và bao lâu thì hoàn vốn?',
        a: 'Giá được xác định theo cấu hình và phạm vi cung cấp cho từng dự án. Thời gian hoàn vốn cần tính từ sản lượng, chu kỳ tổng, mức sử dụng máy và toàn bộ chi phí đầu tư, vận hành.',
      },
      {
        q: 'Đào tạo, bảo hành và hỗ trợ ra sao?',
        a: 'Phạm vi đào tạo, điều kiện bảo hành và đầu mối hỗ trợ ghi rõ trong đề xuất hoặc hợp đồng. Nêu yêu cầu riêng của doanh nghiệp để chốt từng mục trước khi triển khai.',
      },
    ],
  },

  /** S10 — Liên hệ và form tư vấn */
  lienHe: landingContact,

  /** S11 — Footer và tiện ích liên hệ */
  footer: {
    anchor: 'footer',
    name: 'VN-J',
    navigationTitle: 'Khám phá AiRobot',
    legalTitle: 'Thông tin pháp lý',
    legalName: 'Công Ty Cổ Phần Cơ Khí Chính Xác VN-J',
    body: 'Thiết kế, chế tạo trạm robot hàn tự động AiRobot trên ray.',
    hotline: { label: `Hotline: ${phoneDisplay}`, href: `tel:${phoneRaw}` },
    addressLabel: 'Địa chỉ',
    address: 'Tầng 4, số 46b LK 19A-19B, Phường Dương Nội, TP Hà Nội',
    links: [
      { label: 'Hệ thống', href: '#he-thong' },
      { label: 'Ứng dụng', href: '#ung-dung' },
      { label: 'Về VN-J', href: '#ve-vnj' },
      { label: 'Liên hệ', href: '#tu-van' },
      { label: 'Chính sách bảo mật', href: '/privacy' },
      { label: 'Điều khoản sử dụng', href: '/terms' },
      { label: 'Cài đặt cookie', href: '#cookie-settings' },
    ],
    mobileBar: {
      call: { label: 'Gọi VN-J', href: `tel:${phoneRaw}` },
      contact: { label: 'Nhận tư vấn', href: '#tu-van' },
    },
    iconLabels: {
      call: 'Gọi hotline VN-J',
      zalo: 'Trao đổi với VN-J qua Zalo',
      backToTop: 'Lên đầu trang',
    },
  },
} as const;

/** Preserve ASCII for metadata; apply nonbreaking brand name only for display. */
const BRAND_ASCII = 'VN-J';
const BRAND_HIEN_THI = 'VN\u2011J'; // U+2011 NON-BREAKING HYPHEN

// Bỏ qua các khóa mang giá trị máy đọc: href, mã gửi lên server, và tên neo
// dùng làm id/anchor. Hiện chưa khóa nào trong số này chứa "VN-J", chặn sẵn để
// sau này ai thêm href kiểu "/ve-VN-J" thì liên kết không hỏng.
// KHÔNG đưa 'name' hay 'label' vào đây — đó là khóa của chữ hiển thị.
const KHOA_BO_QUA = new Set(['href', 'value', 'slug', 'anchor']);

function thayGachNoi<T>(giaTri: T, khoa?: string): T {
  if (khoa !== undefined && KHOA_BO_QUA.has(khoa)) return giaTri;
  if (typeof giaTri === 'string') return giaTri.split(BRAND_ASCII).join(BRAND_HIEN_THI) as unknown as T;
  if (Array.isArray(giaTri)) return giaTri.map((phanTu) => thayGachNoi(phanTu)) as unknown as T;
  if (giaTri !== null && typeof giaTri === 'object') {
    return Object.fromEntries(
      Object.entries(giaTri as Record<string, unknown>).map(([k, v]) => [k, thayGachNoi(v, k)]),
    ) as unknown as T;
  }
  return giaTri;
}

/** Bản hiển thị — dùng cho mọi chữ người đọc thấy. */
export const landingCopy = thayGachNoi(landingCopySource);

/** Bản gốc gạch ASCII — dùng cho JSON-LD và mọi nơi máy đọc. */
export { landingCopySource };

export type LandingCopy = typeof landingCopySource;
