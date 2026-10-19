/** Public reference configuration. Source and limits apply to every property. */
export const airobotProduct = {
  name: 'Trạm robot hàn tự động AiRobot',
  manufacturer: 'Công Ty Cổ Phần Cơ Khí Chính Xác VN-J',
  description: 'AiRobot là giải pháp robot hàn thông minh do VN-J thiết kế và chế tạo, tích hợp quét phôi tự động và xử lý dữ liệu 3D bằng AI. Hệ thống phục vụ nhu cầu hàn trong đóng tàu, kết cấu thép và cơ khí chế tạo.',
  source: 'https://vn-j247.com/tram-robot-cong-nghiep-6-truc-hoac-7-truc',
  referenceTitle: 'Cấu hình tham chiếu của trạm AiRobot',
  referenceNote: 'Bảng thông số mô tả cấu hình tham chiếu 7 trục trên ray. Cấu hình 6 hoặc 8 trục và phạm vi hàn được xác định riêng theo ứng dụng, vật liệu, dạng liên kết và yêu cầu chất lượng.',
  // Positions use only the image box, excluding its caption. Camera location
  // matches the blue unit identified in the owner's reference crop.
  components: [
    { label: 'Hệ thống camera AI scan 3D', left: '66%', top: '16%' },
    { label: 'Cánh tay robot hàn', left: '56%', top: '38%' },
    { label: 'Cụm đầu hàn', left: '80%', top: '22%' },
    { label: 'Nguồn hàn', left: '27%', top: '51%' },
    { label: 'Tủ điều khiển', left: '75%', top: '61%' },
    { label: 'Cơ cấu di chuyển trên ray', left: '45%', top: '80%' },
  ],
  features: [
    {
      h3: 'Quét phôi tự động với camera AI scan 3D',
      body: 'Camera và cảm biến thị giác quét hình học phôi. Phần mềm AI xử lý dữ liệu để dựng mô hình 3D, nhận dạng vị trí phôi và xác định đường hàn.',
    },
    {
      h3: 'Từ mô hình 3D đến quỹ đạo hàn',
      body: 'Phần mềm xác định đường hàn trên mô hình phôi và đề xuất chương trình hàn. Robot di chuyển mỏ hàn theo quỹ đạo và trình tự đã thiết lập.',
    },
    {
      h3: 'Cấu hình hệ trục 6, 7 hoặc 8 trục',
      body: 'AiRobot có cấu hình hệ 6, 7 hoặc 8 trục; cấu hình 8 trục dành cho ứng dụng tại nhà máy đóng tàu. Cấu hình tham chiếu trên ray gồm cánh tay 6 trục và một trục di chuyển ngoài.',
    },
    {
      h3: 'Giao diện vận hành tiếng Việt',
      body: 'HMI tiếng Việt phục vụ thao tác và theo dõi hệ thống. Quy trình vận hành, chuẩn bị phôi và đổi mã được xác định theo từng ứng dụng.',
    },
  ],
  specifications: [
    { label: 'Phương pháp hàn', value: 'MIG/MAG' },
    { label: 'Hệ trục của cấu hình tham chiếu', value: '7 trục: cánh tay 6 trục + 1 trục ray ngoài' },
    { label: 'Chiều dày vật liệu tham chiếu', value: '6–25 mm' },
    { label: 'Chiều dài ray tham chiếu', value: '12 m, có thể tùy chỉnh' },
    { label: 'Quét và nhận dạng phôi', value: 'Camera/cảm biến thị giác, xử lý mô hình 3D bằng AI' },
    { label: 'Nhận dạng đường hàn', value: 'Cảm biến laser, phần mềm xử lý bằng AI' },
    { label: 'Giao diện vận hành', value: 'HMI tiếng Việt' },
    { label: 'Nguồn điện', value: 'AC 3 pha 380 V ±10%, 50 Hz' },
    { label: 'Công suất công bố', value: '70 kW' },
    { label: 'Khí bảo vệ', value: 'Ar 80% + CO₂ 20%, hoặc CO₂' },
  ],
} as const;
