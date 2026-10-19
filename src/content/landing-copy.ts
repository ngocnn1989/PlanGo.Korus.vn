/**
 * Lớp ghép copy cho các component dùng chung của framework (header, footer,
 * form, SeoHead, widget nổi). Nội dung gốc nằm ở plango-copy.ts; file này chỉ
 * bổ sung hotline/footer lấy từ site profile và giữ nguyên tên export mà
 * framework đang đọc (`landingCopy`, `landingCopySource`).
 */

import { plangoCopy } from './plango-copy';
import { landingContact } from './landing-contact';
import siteProfile from '../config/site-profile.mjs';

const phoneProfile = siteProfile.contact?.phone;
const phoneRaw = (phoneProfile?.enabled && phoneProfile.raw) || '';
const phoneDisplay = (phoneProfile?.enabled && (phoneProfile.display || phoneProfile.raw)) || '';

const landingCopySource = {
  ...plangoCopy,
  header: {
    ...plangoCopy.header,
    hotline: {
      label: `Hotline PlanGo: ${phoneDisplay}`,
      display: phoneDisplay,
      href: `tel:${phoneRaw}`,
    },
  },
  lienHe: landingContact,
  footer: {
    anchor: 'footer',
    name: plangoCopy.footer.name,
    navigationTitle: 'Khám phá PlanGo',
    legalTitle: 'Thông tin pháp lý',
    legalName: plangoCopy.footer.legalName,
    body: plangoCopy.footer.note,
    hotline: { label: `Hotline: ${phoneDisplay}`, href: `tel:${phoneRaw}` },
    addressLabel: 'Website',
    address: plangoCopy.footer.website,
    links: [
      { label: 'Lợi ích', href: '#loi-ich' },
      { label: 'Cách hoạt động', href: '#cach-hoat-dong' },
      { label: 'Bảng giá', href: '#bang-gia' },
      { label: 'Liên hệ', href: '#tu-van' },
      { label: 'Chính sách bảo mật', href: '/privacy' },
      { label: 'Điều khoản sử dụng', href: '/terms' },
      { label: 'Cài đặt cookie', href: '#cookie-settings' },
    ],
    mobileBar: {
      call: { label: 'Gọi KORUS', href: `tel:${phoneRaw}` },
      contact: { label: 'Đặt lịch demo', href: '#tu-van' },
    },
    iconLabels: {
      call: 'Gọi hotline PlanGo',
      zalo: 'Nhắn Zalo cho KORUS',
      backToTop: 'Lên đầu trang',
    },
  },
} as const;

/** Bản hiển thị — PlanGo không cần thay ký tự nên trùng bản nguồn. */
export const landingCopy = landingCopySource;

/** Bản nguồn — dùng cho JSON-LD và mọi nơi máy đọc. */
export { landingCopySource };

export type LandingCopy = typeof landingCopySource;
