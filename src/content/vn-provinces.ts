/**
 * 34 đơn vị hành chính cấp tỉnh của Việt Nam từ 01/07/2025
 * (Nghị quyết 202/2025/QH15: 28 tỉnh + 6 thành phố trực thuộc Trung ương).
 *
 * Dùng cho trường "Tỉnh/Thành" của form lead. `code` là giá trị gửi lên server
 * (danh sách đóng, kiểm tra ở src/utils/lead-request.ts); `name` là tên ghi vào
 * Google Sheet; `formerly` liệt kê tỉnh cũ đã nhập vào để khách quen tên cũ vẫn
 * chọn đúng. Apps Script giữ bản sao bảng code → name (docs/apps-script/lead-webhook.gs).
 */

export type ProvinceRegion = 'bac' | 'trung' | 'nam';

export interface VnProvince {
  code: string;
  name: string;
  region: ProvinceRegion;
  formerly?: readonly string[];
}

export const PROVINCE_REGIONS: readonly { id: ProvinceRegion; label: string }[] = [
  { id: 'bac', label: 'Miền Bắc' },
  { id: 'trung', label: 'Miền Trung và Tây Nguyên' },
  { id: 'nam', label: 'Miền Nam' },
];

export const VN_PROVINCES: readonly VnProvince[] = [
  // Miền Bắc (15)
  { code: 'ha-noi', name: 'Hà Nội', region: 'bac' },
  { code: 'hai-phong', name: 'Hải Phòng', region: 'bac', formerly: ['Hải Dương'] },
  { code: 'quang-ninh', name: 'Quảng Ninh', region: 'bac' },
  { code: 'bac-ninh', name: 'Bắc Ninh', region: 'bac', formerly: ['Bắc Giang'] },
  { code: 'hung-yen', name: 'Hưng Yên', region: 'bac', formerly: ['Thái Bình'] },
  { code: 'ninh-binh', name: 'Ninh Bình', region: 'bac', formerly: ['Hà Nam', 'Nam Định'] },
  { code: 'phu-tho', name: 'Phú Thọ', region: 'bac', formerly: ['Vĩnh Phúc', 'Hòa Bình'] },
  { code: 'thai-nguyen', name: 'Thái Nguyên', region: 'bac', formerly: ['Bắc Kạn'] },
  { code: 'tuyen-quang', name: 'Tuyên Quang', region: 'bac', formerly: ['Hà Giang'] },
  { code: 'lao-cai', name: 'Lào Cai', region: 'bac', formerly: ['Yên Bái'] },
  { code: 'cao-bang', name: 'Cao Bằng', region: 'bac' },
  { code: 'lang-son', name: 'Lạng Sơn', region: 'bac' },
  { code: 'lai-chau', name: 'Lai Châu', region: 'bac' },
  { code: 'dien-bien', name: 'Điện Biên', region: 'bac' },
  { code: 'son-la', name: 'Sơn La', region: 'bac' },
  // Miền Trung và Tây Nguyên (11)
  { code: 'thanh-hoa', name: 'Thanh Hóa', region: 'trung' },
  { code: 'nghe-an', name: 'Nghệ An', region: 'trung' },
  { code: 'ha-tinh', name: 'Hà Tĩnh', region: 'trung' },
  { code: 'quang-tri', name: 'Quảng Trị', region: 'trung', formerly: ['Quảng Bình'] },
  { code: 'hue', name: 'Huế', region: 'trung' },
  { code: 'da-nang', name: 'Đà Nẵng', region: 'trung', formerly: ['Quảng Nam'] },
  { code: 'quang-ngai', name: 'Quảng Ngãi', region: 'trung', formerly: ['Kon Tum'] },
  { code: 'gia-lai', name: 'Gia Lai', region: 'trung', formerly: ['Bình Định'] },
  { code: 'dak-lak', name: 'Đắk Lắk', region: 'trung', formerly: ['Phú Yên'] },
  { code: 'khanh-hoa', name: 'Khánh Hòa', region: 'trung', formerly: ['Ninh Thuận'] },
  { code: 'lam-dong', name: 'Lâm Đồng', region: 'trung', formerly: ['Đắk Nông', 'Bình Thuận'] },
  // Miền Nam (8)
  { code: 'ho-chi-minh', name: 'TP. Hồ Chí Minh', region: 'nam', formerly: ['Bình Dương', 'Bà Rịa – Vũng Tàu'] },
  { code: 'dong-nai', name: 'Đồng Nai', region: 'nam', formerly: ['Bình Phước'] },
  { code: 'tay-ninh', name: 'Tây Ninh', region: 'nam', formerly: ['Long An'] },
  { code: 'can-tho', name: 'Cần Thơ', region: 'nam', formerly: ['Sóc Trăng', 'Hậu Giang'] },
  { code: 'vinh-long', name: 'Vĩnh Long', region: 'nam', formerly: ['Bến Tre', 'Trà Vinh'] },
  { code: 'dong-thap', name: 'Đồng Tháp', region: 'nam', formerly: ['Tiền Giang'] },
  { code: 'an-giang', name: 'An Giang', region: 'nam', formerly: ['Kiên Giang'] },
  { code: 'ca-mau', name: 'Cà Mau', region: 'nam', formerly: ['Bạc Liêu'] },
];

/** Nhãn trong ô chọn: tên mới, kèm tỉnh cũ đã nhập vào (nếu có). */
export function provinceOptionLabel(province: VnProvince): string {
  return province.formerly?.length ? `${province.name} (gồm ${province.formerly.join(', ')})` : province.name;
}

/** Nhóm theo miền, xếp A–Z tiếng Việt trong từng nhóm — dùng trực tiếp cho <optgroup>. */
export function provinceGroups() {
  return PROVINCE_REGIONS.map((region) => ({
    ...region,
    options: VN_PROVINCES.filter((p) => p.region === region.id)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
      .map((p) => ({ value: p.code, label: provinceOptionLabel(p) })),
  }));
}

export const PROVINCE_CODES: ReadonlySet<string> = new Set(VN_PROVINCES.map((p) => p.code));
