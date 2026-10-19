/**
 * Dữ kiện công khai của PlanGo — nguồn chuẩn cho landing, JSON-LD và /llms.txt.
 *
 * Mỗi claim mang `id` và `source` trỏ tới mã nguồn/tài liệu của sản phẩm trong
 * `HUNG-NHAN/` (đường dẫn tương đối từ thư mục gốc dự án sản phẩm). Không thêm
 * claim không có nguồn; không đưa con số hiệu quả (giờ tiết kiệm, % năng suất,
 * % công suất) cho tới khi có số đo thí điểm và chấp thuận của nhà máy
 * (KE-HOACH-LANDING-PLANGO.md §1.1, G9).
 */

export interface PlanGoClaim {
  id: string;
  text: string;
  source: string;
}

export const plangoProduct = {
  name: 'PlanGo',
  vendor: 'Công ty Cổ phần Công nghệ KORUS',
  vendorUrl: 'https://korus.vn',
  category: 'Phần mềm lập kế hoạch và theo dõi tiến độ sản xuất ngành may',
  operatingSystem: 'Windows',
  audience: 'Nhà máy may mặc: giám đốc sản xuất, quản đốc, phòng kế hoạch',

  /** Bốn lợi ích chính (owner yêu cầu 19/10/2026) — định tính, gắn cơ chế có thật. */
  benefits: [
    {
      id: 'b1',
      title: 'Rút ngắn thời gian lập kế hoạch',
      body: 'Ra lệnh bằng chat, hệ thống tự tính và trả về 2–3 phương án kế hoạch. Không phải gom nhiều file và tính tay từng chuyền.',
      source: 'planner-core/src/planner_core/planning/core_smart_planner.py; docs/system-architecture.md (SB:plan)',
    },
    {
      id: 'b2',
      title: 'Lịch sản xuất được tối ưu',
      body: 'Mỗi phương án được chấm điểm theo đúng hạn giao, cân bằng tải chuyền, ngày chuyền chờ việc, giờ tăng ca, số lần tách đơn và độ đồng bộ ngày hoàn thành.',
      source: 'planner-core/src/planner_core/planning/optimizer_scoring.py; workshop_optimizer.py (_recommend)',
    },
    {
      id: 'b3',
      title: 'Tận dụng công suất các chuyền may',
      body: 'Công suất tính theo năng suất và lao động thực có của từng chuyền. Gantt cho thấy chuyền nào đang rảnh, chuyền nào quá tải để xếp việc lấp khoảng trống.',
      source: 'README.md (pcs_per_worker_day * effective_worker_count); planning/line_running_load.py; optimizer_scoring.py (idle_gap)',
    },
    {
      id: 'b4',
      title: 'Nền tảng để nâng năng suất lao động',
      body: 'Giảm chờ việc và tăng ca không cần thiết ngay từ khâu kế hoạch; sản lượng thực tế nhập hằng ngày để theo dõi năng suất từng chuyền, từng đơn.',
      source: 'optimizer_scoring.py (overtime_penalty, idle_penalty); daily_actuals_v3; dashboard/src/components/variance-panel.tsx',
    },
  ],

  /** Ba hướng phương án của bộ tối ưu (nhãn hiển thị theo legal gate). */
  planningGoals: [
    { code: 'A', label: 'Ít xáo trộn kế hoạch đang chạy', source: 'workshop_optimizer.py PROFILES.A minimal_disruption' },
    { code: 'B', label: 'Cân bằng tải toàn phân xưởng', source: 'workshop_optimizer.py PROFILES.B balanced_workshop' },
    { code: 'C', label: 'Ưu tiên kịp hạn giao', source: 'workshop_optimizer.py PROFILES.C deadline_recovery' },
  ],

  /** Sáu tiêu chí chấm điểm phương án. */
  scoringCriteria: [
    'Đúng hạn giao hàng',
    'Cân bằng tải giữa các chuyền',
    'Ít ngày chuyền nằm chờ việc',
    'Ít giờ tăng ca',
    'Ít tách nhỏ đơn hàng',
    'Các chuyền hoàn thành đồng bộ',
  ],

  /** Claims tính năng (kế thừa bảng s1–s7 của kịch bản video, bổ sung f*). */
  claims: [
    { id: 's1', text: 'Gantt theo từng chuyền, tách thực tế và dự báo', source: 'docs/project-changelog.md (01/10/2026); dashboard/src/components/line-progress-gantt.tsx' },
    { id: 's2', text: 'Nhập đơn hàng từ Excel có kiểm duyệt, xác nhận rồi mới lưu', source: 'README.md — Excel Import Guardrails' },
    { id: 's3', text: 'Đưa ra 2–3 phương án kế hoạch để chọn', source: 'docs/system-architecture.md — SB:plan' },
    { id: 's4', text: 'Công suất = năng suất × lao động', source: 'README.md (pcs_per_worker_day * effective_worker_count)' },
    { id: 's5', text: 'Báo xung đột tải chuyền', source: 'docs/system-architecture.md (line_load_conflict)' },
    { id: 's6', text: 'Số liệu do hệ thống tính, AI chỉ điều phối và giải thích', source: 'docs/project-overview-pdr.md — Nguyên tắc quyết định' },
    { id: 's7', text: 'Dữ liệu lưu trên máy tại nhà máy', source: 'README.md (local-first, SQLite)' },
    { id: 'f1', text: 'Nhập sản lượng thực tế hằng ngày qua bảng tiến độ hoặc chat', source: 'README.md (upsert-actual-v3, dashboard actual entry)' },
    { id: 'f2', text: 'Nhập và xuất báo cáo tiến độ tháng (BCTĐ) có xem trước', source: 'README.md (BCTĐ review/preview/commit, export-bctd-v3-excel)' },
    { id: 'f3', text: 'Xuất kế hoạch sản xuất (KHSX) ra Excel theo mẫu của nhà máy', source: 'README.md (export-khsx-v3-excel)' },
    { id: 'f4', text: 'Báo cáo rà soát rủi ro và báo cáo giải thích kế hoạch', source: 'docs/system-architecture.md (SB:audit); write-planning-explanation-report' },
    { id: 'f5', text: 'Bảng tiến độ theo nhà máy, phân xưởng, chuyền với chỉ số KPI', source: 'docs/project-roadmap.md (V3 factory/month view, KPI cards)' },
    { id: 'f6', text: 'Bổ sung đơn hàng, chuyển/tách lô có xem trước và xác nhận', source: 'README.md (order supplement, bctd-lot-transition)' },
    { id: 'f7', text: 'Bản quyền theo máy, kiểm tra toàn vẹn khi chạy', source: 'docs/mcp-runtime-architecture.md (license, runtime integrity)' },
    { id: 'f8', text: 'Giữ Excel làm đầu vào, đầu ra quen thuộc', source: 'docs/project-overview-pdr.md — Mục tiêu sản phẩm' },
  ] satisfies readonly PlanGoClaim[],

  /** Quy trình vận hành hằng ngày (hướng dẫn GĐSX). */
  workflow: [
    'Nhập tiến độ thực tế',
    'Nhập đơn hàng mới',
    'Lập kế hoạch',
    'Theo dõi bảng tiến độ',
    'Xuất Excel',
    'Rà soát rủi ro khi có biến động',
  ],
} as const;

export type PlanGoProduct = typeof plangoProduct;
