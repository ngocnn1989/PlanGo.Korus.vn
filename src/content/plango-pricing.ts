/**
 * Gói dịch vụ và khung giá PlanGo — owner duyệt 19/10/2026
 * (KE-HOACH-LANDING-PLANGO.md §5, decision D-01).
 *
 * Mọi số tiền là VNĐ, chưa gồm VAT. Landing hiển thị mức "từ" (cận dưới);
 * khoảng đầy đủ dùng cho báo giá nội bộ và công cụ ước tính.
 */

export interface PriceRange {
  /** Đơn vị: triệu đồng. */
  min: number;
  max: number;
}

export interface PlanGoPlan {
  id: 'co-ban' | 'tieu-chuan' | 'nang-cao' | 'doanh-nghiep';
  name: string;
  audience: string;
  lines: { min: number; max: number | null };
  workshops: string;
  licensedMachines: string;
  annualFee: PriceRange | null;
  setupFee: PriceRange | null;
  /** Phí thêm mỗi chuyền ngoài hạn mức, nghìn đồng/chuyền/tháng. */
  extraLinePerMonth: PriceRange | null;
  support: string;
  highlighted?: boolean;
  cta: string;
}

export const plangoPlans: readonly PlanGoPlan[] = [
  {
    id: 'co-ban',
    name: 'Cơ bản',
    audience: 'Xưởng nhỏ, một phân xưởng',
    lines: { min: 1, max: 5 },
    workshops: '1 phân xưởng',
    licensedMachines: '1 máy',
    annualFee: { min: 24, max: 36 },
    setupFee: { min: 8, max: 12 },
    extraLinePerMonth: { min: 300, max: 400 },
    support: 'Zalo, điện thoại, email trong giờ hành chính',
    cta: 'Nhận báo giá gói Cơ bản',
  },
  {
    id: 'tieu-chuan',
    name: 'Tiêu chuẩn',
    audience: 'Nhà máy vừa, nhiều phân xưởng',
    lines: { min: 6, max: 15 },
    workshops: 'Đến 4 phân xưởng',
    licensedMachines: '1 máy',
    annualFee: { min: 60, max: 84 },
    setupFee: { min: 20, max: 30 },
    extraLinePerMonth: { min: 250, max: 350 },
    support: 'Như gói Cơ bản, thêm hỗ trợ điều khiển từ xa',
    highlighted: true,
    cta: 'Nhận báo giá gói Tiêu chuẩn',
  },
  {
    id: 'nang-cao',
    name: 'Nâng cao',
    audience: 'Nhà máy lớn',
    lines: { min: 16, max: 40 },
    workshops: 'Không giới hạn trong một nhà máy',
    licensedMachines: '2 máy',
    annualFee: { min: 120, max: 180 },
    setupFee: { min: 40, max: 60 },
    extraLinePerMonth: { min: 200, max: 300 },
    support: 'Như gói Tiêu chuẩn, thêm đào tạo tại nhà máy và xử lý ưu tiên',
    cta: 'Nhận báo giá gói Nâng cao',
  },
  {
    id: 'doanh-nghiep',
    name: 'Doanh nghiệp',
    audience: 'Tập đoàn, nhiều nhà máy',
    lines: { min: 41, max: null },
    workshops: 'Nhiều nhà máy',
    licensedMachines: 'Theo thỏa thuận',
    annualFee: null,
    setupFee: null,
    extraLinePerMonth: null,
    support: 'Theo thỏa thuận',
    cta: 'Liên hệ báo giá',
  },
];

export type FeatureAvailability = boolean | string;

export interface PlanGoFeatureRow {
  feature: string;
  /** Mã claim trong plango-product.ts làm căn cứ. */
  claim: string;
  coBan: FeatureAvailability;
  tieuChuan: FeatureAvailability;
  nangCao: FeatureAvailability;
}

export const plangoFeatureMatrix: readonly PlanGoFeatureRow[] = [
  { feature: 'Khai báo xưởng, chuyền, lịch làm việc; công suất theo năng suất × lao động', claim: 's4', coBan: true, tieuChuan: true, nangCao: true },
  { feature: 'Nhập đơn hàng từ Excel có kiểm duyệt (mẫu đầy đủ và rút gọn)', claim: 's2', coBan: true, tieuChuan: true, nangCao: true },
  { feature: 'Gantt từng chuyền, tách thực tế và dự báo; bảng tiến độ tháng', claim: 's1', coBan: true, tieuChuan: true, nangCao: true },
  { feature: 'Nhập sản lượng thực tế hằng ngày', claim: 'f1', coBan: true, tieuChuan: true, nangCao: true },
  { feature: 'Xuất kế hoạch sản xuất (KHSX) ra Excel', claim: 'f3', coBan: true, tieuChuan: true, nangCao: true },
  { feature: 'Lập kế hoạch tự động bằng chat', claim: 's3', coBan: '1 phương án', tieuChuan: '2–3 phương án, chấm điểm', nangCao: '2–3 phương án, chấm điểm' },
  { feature: 'Báo xung đột tải chuyền, KPI theo phân xưởng', claim: 's5', coBan: false, tieuChuan: true, nangCao: true },
  { feature: 'Nhập và xuất báo cáo tiến độ tháng (BCTĐ) có xem trước', claim: 'f2', coBan: false, tieuChuan: true, nangCao: true },
  { feature: 'Bổ sung đơn hàng, chuyển/tách lô có xác nhận', claim: 'f6', coBan: false, tieuChuan: true, nangCao: true },
  { feature: 'Báo cáo rà soát rủi ro và giải thích kế hoạch (DOCX)', claim: 'f4', coBan: false, tieuChuan: false, nangCao: true },
  { feature: 'Chuyển đổi mẫu Excel riêng của nhà máy', claim: 'f8', coBan: false, tieuChuan: '1 mẫu', nangCao: 'Đến 3 mẫu' },
  { feature: 'Cập nhật phiên bản trong thời hạn thuê bao', claim: 'f7', coBan: true, tieuChuan: true, nangCao: true },
];

export const plangoPricingNotes = {
  model:
    'Phí bản quyền thuê bao theo năm (cài trên máy của nhà máy) và phí triển khai một lần gồm khảo sát, khai báo xưởng/chuyền, chuyển mẫu Excel và đào tạo.',
  perpetual:
    'Có phương án mua bản quyền một lần: khoảng 2,5 lần phí năm, từ năm thứ hai trả 20% mỗi năm cho bảo trì và cập nhật.',
  vat: 'Giá chưa gồm VAT.',
  estimate: 'Mức phí trên trang là khoảng tham khảo; báo giá chính thức gửi sau buổi khảo sát nhà máy.',
} as const;

/** Gợi ý gói theo số chuyền (công cụ ước tính). */
export function suggestPlan(lineCount: number, workshopCount = 1): PlanGoPlan {
  const byLines =
    lineCount <= 5 ? 'co-ban' : lineCount <= 15 ? 'tieu-chuan' : lineCount <= 40 ? 'nang-cao' : 'doanh-nghiep';
  const id = byLines === 'co-ban' && workshopCount > 1 ? 'tieu-chuan' : byLines;
  return plangoPlans.find((plan) => plan.id === id)!;
}

/** Định dạng "24" → "24 triệu"; dùng dấu chấm nghìn theo vi-VN. */
export function formatMillion(value: number): string {
  return `${value.toLocaleString('vi-VN')} triệu`;
}
