/** Shared contact copy; machine field values remain stable. */
import siteProfile from '../config/site-profile.mjs';

// Số liên hệ lấy từ site profile (nguồn duy nhất), không viết cứng.
const phone = siteProfile.contact?.phone;
const phoneRaw = (phone?.enabled && phone.raw) || '';
const phoneDisplay = (phone?.enabled && (phone.display || phone.raw)) || '';
const zalo = siteProfile.chat_widgets?.zalo;
const zaloUrl = (siteProfile.chat_widgets?.enabled && zalo?.enabled && zalo?.url) || '';

export const landingContact = {
    anchor: 'tu-van',
    h2: 'Nhận tư vấn ứng dụng AiRobot cho nhà xưởng',
    body: 'Để lại thông tin liên hệ và mô tả ngắn công đoạn cần tự động hóa. Bản vẽ và yêu cầu kỹ thuật có thể bổ sung trong bước trao đổi tiếp theo.',
    cauHoTro:
      'Mô tả ngắn về công đoạn đang quan tâm là điểm bắt đầu.',
    formTitle: 'Nhận tư vấn AiRobot',
    formBody: 'Để lại thông tin liên hệ và nhu cầu của bạn.',
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
        label: 'Doanh nghiệp',
        required: false,
        placeholder: 'Tên doanh nghiệp hoặc xưởng',
      },
      {
        name: 'application',
        label: 'Nhóm ứng dụng',
        required: false,
        placeholder: 'Chọn nhóm ứng dụng',
      },
      {
        name: 'message',
        label: 'Nhu cầu của bạn',
        required: false,
        placeholder: 'Ví dụ: loại chi tiết, vật liệu, chiều dày và sản lượng dự kiến',
      },
      {
        name: 'email',
        label: 'Email nhận thông tin',
        required: false,
        placeholder: 'Email nếu bạn muốn nhận thông tin qua email',
      },
    ],
    // Nhãn của option trong dropdown là nhãn UI, không mang dấu chấm cuối câu.
    applicationOptions: [
      { value: 'shipbuilding', label: 'Đóng tàu & kết cấu lớn' },
      { value: 'structural-steel', label: 'Kết cấu thép' },
      { value: 'precision-fabrication', label: 'Chi tiết cơ khí theo lô' },
      { value: 'other', label: 'Ứng dụng khác' },
      { value: 'undecided', label: 'Chưa xác định' },
    ],
    messageHint: 'Chưa cần gửi bản vẽ ở bước này.',
    // Gợi ý định dạng đặt ngay dưới ô, để khách biết trước thay vì đoán rồi bị báo lỗi.
    phoneHint: 'Ví dụ: 0912 345 678 · 0912.345.678 · +84 912 345 678',
    mobileGroupLabel: 'Bổ sung thông tin về chi tiết',
    // Không còn ô tick: đây là dòng thông báo tĩnh đặt ngay dưới nút gửi.
    // Giữ nguyên tên khóa `consent` để LeadForm/LeadModal không phải đổi
    // đường dẫn chữ, và để câu này vẫn có đúng một nguồn.
    consent:
      'Bằng việc gửi thông tin, bạn đồng ý để VN-J liên hệ và tư vấn theo Chính sách bảo mật.',
    consentLink: { label: 'Chính sách bảo mật', href: '/privacy' },
    submit: 'Gửi yêu cầu tư vấn AiRobot',
    // Câu thận trọng duy nhất của S10, đặt cuối khối form.
    note: 'Cấu hình, chi phí và phạm vi cung cấp được xác định theo nhu cầu thực tế.',
    validation: {
      missingName: 'Vui lòng nhập họ tên để tiện xưng hô khi liên hệ.',
      missingPhone: 'Vui lòng nhập số điện thoại để liên hệ lại.',
      // Mỗi nguyên nhân một câu riêng. Bản cũ dùng chung 'Vui lòng kiểm tra lại
      // số điện thoại.' cho mọi trường hợp, nên khách không biết mình sai chỗ nào
      // và thường bỏ cuộc thay vì sửa.
      invalidPhone: 'Vui lòng kiểm tra lại số điện thoại.',
      phoneHasLetters: 'Số điện thoại chỉ gồm chữ số. Ví dụ: 0912 345 678',
      phoneTooShort: 'Số điện thoại còn thiếu chữ số. Số di động Việt Nam có 10 chữ số, ví dụ 0912 345 678.',
      phoneTooLong: 'Số điện thoại dài hơn bình thường. Bạn kiểm tra lại giúp — ví dụ 0912 345 678.',
      invalidEmail: 'Vui lòng kiểm tra lại địa chỉ email.',
      multiple: 'Vui lòng kiểm tra các thông tin được đánh dấu.',
    },
    states: {
      sending: {
        submit: 'Đang gửi nhu cầu…',
      },
      success: {
        title: 'VN-J đã nhận được nhu cầu của bạn',
        body: 'Cảm ơn bạn đã chia sẻ. Thông tin liên hệ vừa gửi dùng để trao đổi thêm về nhu cầu này.',
        extra:
          'Chuẩn bị thêm ảnh chi tiết, vật liệu và yêu cầu sản xuất thì cuộc trao đổi tới sẽ nhanh hơn.',
        actions: [
          { label: 'Gọi VN-J', href: `tel:${phoneRaw}` },
          { label: 'Xem lại hệ thống', href: '/#he-thong' },
        ],
      },
      error: {
        title: 'Chưa gửi được nhu cầu',
        body: 'Vui lòng thử lại. Thông tin bạn đã nhập vẫn được giữ trên trang này. Bạn cũng có thể gọi VN-J hoặc trao đổi qua Zalo.',
        retry: 'Thử gửi lại',
      },
      unknown: {
        title: 'Chưa xác nhận được trạng thái gửi',
        body: 'Kết nối vừa bị gián đoạn. Vui lòng kiểm tra trạng thái trước khi gửi lại để tránh tạo yêu cầu trùng. Bạn có thể gọi VN-J nếu cần trao đổi ngay.',
        /** Dùng khi trang chưa có cơ chế kiểm tra trạng thái yêu cầu. */
        bodyKhongKiemTraTrangThai:
          'Kết nối vừa bị gián đoạn nên chưa rõ yêu cầu đã tới nơi hay chưa. Bạn có thể gọi VN-J để trao đổi hoặc kiểm tra lại yêu cầu.',
      },
    },
    kenhTrucTiep: {
      title: 'Muốn trao đổi trực tiếp?',
      phone: { label: `Gọi VN-J: ${phoneDisplay}`, href: `tel:${phoneRaw}` },
      zalo: { label: 'Trao đổi qua Zalo', href: zaloUrl },
    },
    // Nội dung trang cảm ơn /thank-you — trang xác nhận sau khi gửi form.
    // Trang này noindex, nhưng vẫn giữ chuẩn về cấu trúc: một H1 duy nhất,
    // tiêu đề/mô tả rõ ràng. Các kênh liên hệ lấy từ site-profile.
    thankYou: {
      metaTitle: 'Cảm ơn bạn đã liên hệ VN-J — Tư vấn trạm robot hàn AiRobot',
      metaDescription:
        'Xác nhận tiếp nhận yêu cầu tư vấn AiRobot và các kênh liên hệ với VN-J.',
      eyebrow: 'Gửi yêu cầu thành công',
      title: 'Cảm ơn bạn đã liên hệ!',
      intro:
        'VN-J đã nhận được yêu cầu tư vấn AiRobot. Chúng tôi sẽ liên hệ theo thông tin bạn đã cung cấp để trao đổi nhu cầu hàn.',
      prepareHeading: 'Để trao đổi cụ thể hơn',
      prepareBody:
        'Nếu tiện, bạn có thể chuẩn bị:',
      prepareItems: [
        'Ảnh hoặc bản vẽ chi tiết cần hàn',
        'Vật liệu, chiều dày và yêu cầu mối hàn',
        'Sản lượng dự kiến',
      ],
      contactLead: 'Muốn trao đổi thêm với VN-J?',
      contactNote: 'Chọn kênh liên hệ thuận tiện cho bạn.',
      actions: {
        system: 'Xem lại hệ thống AiRobot',
        systemHref: '/#he-thong',
        call: 'Gọi VN-J',
        zalo: 'Trao đổi qua Zalo',
      },
    },
  } as const;
