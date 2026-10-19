/** Shared contact copy (form demo PlanGo); machine field values remain stable. */
import siteProfile from '../config/site-profile.mjs';

// Số liên hệ lấy từ site profile (nguồn chuẩn), không viết cứng.
const phone = siteProfile.contact?.phone;
const phoneRaw = (phone?.enabled && phone.raw) || '';
const phoneDisplay = (phone?.enabled && (phone.display || phone.raw)) || '';
const zalo = siteProfile.chat_widgets?.zalo;
const zaloUrl = (siteProfile.chat_widgets?.enabled && zalo?.enabled && zalo?.url) || '';

export const landingContact = {
    anchor: 'tu-van',
    h2: 'Đặt lịch demo PlanGo',
    body: 'Để lại thông tin và quy mô nhà máy. KORUS liên hệ để sắp xếp buổi demo và gửi báo giá theo số chuyền.',
    cauHoTro:
      'Có thể demo trên dữ liệu mẫu, hoặc trên file Excel đơn hàng của nhà máy nếu bạn muốn.',
    formTitle: 'Đặt lịch demo PlanGo',
    formBody: 'Điền thông tin, KORUS sẽ gọi lại để hẹn lịch.',
    fields: [
      {
        name: 'name',
        label: 'Họ và tên',
        required: true,
        placeholder: 'Họ tên của bạn',
      },
      {
        name: 'phone',
        label: 'Số điện thoại',
        required: true,
        placeholder: 'Số điện thoại liên hệ',
      },
      {
        name: 'company',
        label: 'Nhà máy / doanh nghiệp',
        required: false,
        placeholder: 'Tên nhà máy may',
      },
      {
        name: 'application',
        label: 'Gói quan tâm',
        required: false,
        placeholder: 'Chọn gói',
      },
      {
        name: 'message',
        label: 'Quy mô và nhu cầu',
        required: false,
        placeholder: 'Ví dụ: 9 chuyền, 4 phân xưởng; muốn lập kế hoạch tháng và theo dõi tiến độ hằng ngày',
      },
      {
        name: 'email',
        label: 'Email nhận báo giá',
        required: false,
        placeholder: 'Email nếu bạn muốn nhận báo giá qua email',
      },
    ],
    // Mã gói khớp plango-pricing.ts và LEAD_APPLICATIONS trong lead-request.ts.
    applicationOptions: [
      { value: 'co-ban', label: 'Cơ bản (đến 5 chuyền)' },
      { value: 'tieu-chuan', label: 'Tiêu chuẩn (6–15 chuyền)' },
      { value: 'nang-cao', label: 'Nâng cao (16–40 chuyền)' },
      { value: 'doanh-nghiep', label: 'Doanh nghiệp (trên 40 chuyền)' },
      { value: 'undecided', label: 'Chưa xác định' },
    ],
    messageHint: 'Số chuyền và số phân xưởng giúp KORUS báo giá sát hơn.',
    phoneHint: 'Ví dụ: 0912 345 678 · 0912.345.678 · +84 912 345 678',
    mobileGroupLabel: 'Bổ sung quy mô nhà máy',
    // Dòng thông báo tĩnh đặt ngay dưới nút gửi (không có ô tick).
    consent:
      'Bằng việc gửi thông tin, bạn đồng ý để KORUS liên hệ và tư vấn theo Chính sách bảo mật.',
    consentLink: { label: 'Chính sách bảo mật', href: '/privacy' },
    submit: 'Gửi yêu cầu demo',
    note: 'Báo giá chính thức gửi sau buổi khảo sát, theo số chuyền và gói chức năng của nhà máy.',
    validation: {
      missingName: 'Vui lòng nhập họ tên để tiện xưng hô khi liên hệ.',
      missingPhone: 'Vui lòng nhập số điện thoại để liên hệ lại.',
      invalidPhone: 'Vui lòng kiểm tra lại số điện thoại.',
      phoneHasLetters: 'Số điện thoại chỉ gồm chữ số. Ví dụ: 0912 345 678',
      phoneTooShort: 'Số điện thoại còn thiếu chữ số. Số di động Việt Nam có 10 chữ số, ví dụ 0912 345 678.',
      phoneTooLong: 'Số điện thoại dài hơn bình thường. Bạn kiểm tra lại giúp — ví dụ 0912 345 678.',
      invalidEmail: 'Vui lòng kiểm tra lại địa chỉ email.',
      multiple: 'Vui lòng kiểm tra các thông tin được đánh dấu.',
    },
    states: {
      sending: {
        submit: 'Đang gửi yêu cầu…',
      },
      success: {
        title: 'KORUS đã nhận yêu cầu demo của bạn',
        body: 'Cảm ơn bạn. KORUS sẽ gọi lại theo số điện thoại vừa gửi để hẹn lịch demo PlanGo.',
        extra:
          'Nếu tiện, chuẩn bị sẵn một file Excel đơn hàng và danh sách chuyền để buổi demo sát với nhà máy hơn.',
        actions: [
          { label: 'Gọi KORUS', href: `tel:${phoneRaw}` },
          { label: 'Xem lại bảng giá', href: '/#bang-gia' },
        ],
      },
      error: {
        title: 'Chưa gửi được yêu cầu',
        body: 'Vui lòng thử lại. Thông tin bạn đã nhập vẫn được giữ trên trang này. Bạn cũng có thể gọi KORUS hoặc nhắn qua Zalo.',
        retry: 'Thử gửi lại',
      },
      unknown: {
        title: 'Chưa xác nhận được trạng thái gửi',
        body: 'Kết nối vừa bị gián đoạn. Vui lòng kiểm tra trạng thái trước khi gửi lại để tránh tạo yêu cầu trùng. Bạn có thể gọi KORUS nếu cần trao đổi ngay.',
        /** Dùng khi trang chưa có cơ chế kiểm tra trạng thái yêu cầu. */
        bodyKhongKiemTraTrangThai:
          'Kết nối vừa bị gián đoạn nên chưa rõ yêu cầu đã tới nơi hay chưa. Bạn có thể gọi KORUS để trao đổi hoặc kiểm tra lại yêu cầu.',
      },
    },
    kenhTrucTiep: {
      title: 'Muốn trao đổi ngay?',
      phone: { label: `Hotline: ${phoneDisplay}`, href: `tel:${phoneRaw}` },
      zalo: { label: `Nhắn Zalo: ${phoneDisplay}`, href: zaloUrl },
    },
    // Trang cảm ơn /thank-you (noindex).
    thankYou: {
      metaTitle: 'Cảm ơn bạn đã đăng ký demo PlanGo',
      metaDescription:
        'Xác nhận tiếp nhận yêu cầu demo PlanGo và các kênh liên hệ với KORUS.',
      eyebrow: 'Gửi yêu cầu thành công',
      title: 'Cảm ơn bạn đã liên hệ!',
      intro:
        'KORUS đã nhận yêu cầu demo PlanGo. Chúng tôi sẽ gọi lại theo thông tin bạn cung cấp để hẹn lịch.',
      prepareHeading: 'Để buổi demo sát với nhà máy',
      prepareBody:
        'Nếu tiện, bạn có thể chuẩn bị:',
      prepareItems: [
        'Danh sách phân xưởng, chuyền và số lao động mỗi chuyền',
        'Một file Excel đơn hàng đang dùng',
        'Mẫu kế hoạch hoặc báo cáo tiến độ hiện tại',
      ],
      contactLead: 'Muốn trao đổi thêm với KORUS?',
      contactNote: 'Chọn kênh liên hệ thuận tiện cho bạn.',
      actions: {
        system: 'Xem lại PlanGo',
        systemHref: '/#cach-hoat-dong',
        call: 'Gọi KORUS',
        zalo: 'Nhắn Zalo',
      },
    },
  } as const;
