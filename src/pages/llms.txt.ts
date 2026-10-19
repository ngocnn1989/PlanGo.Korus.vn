import siteProfile from '../config/site-profile.mjs';
import { plangoProduct } from '../content/plango-product';
import { plangoPlans, formatMillion } from '../content/plango-pricing';
import { landingCopySource } from '../content/landing-copy';

export const prerender = true;

/** Optional reference for readers that use llms.txt; not a Google ranking signal. */
export function GET() {
  const { name, vendor, category, audience, benefits, claims, scoringCriteria, planningGoals } = plangoProduct;
  const { faq } = landingCopySource;
  const origin = siteProfile.canonical_origin;
  const text = [
    `# ${name} — ${category}`,
    '',
    `> ${landingCopySource.hero.body}`,
    '',
    '## Doanh nghiệp và liên hệ',
    '',
    `- Đơn vị phát triển và giữ bản quyền: ${vendor}`,
    `- Đối tượng: ${audience}`,
    `- Hotline / Zalo: ${siteProfile.contact.phone.display}`,
    '',
    '## Lợi ích chính',
    '',
    ...benefits.map(({ title, body }) => `- ${title}: ${body}`),
    '',
    '## Tiêu chí chấm điểm phương án kế hoạch',
    '',
    ...scoringCriteria.map((item) => `- ${item}`),
    `- Hướng phương án: ${planningGoals.map((goal) => goal.label).join('; ')}`,
    '',
    '## Tính năng',
    '',
    ...claims.map(({ text: claim }) => `- ${claim}`),
    '',
    '## Gói và khung giá tham khảo (VNĐ, chưa gồm VAT)',
    '',
    ...plangoPlans.map((plan) => `- ${plan.name} (${plan.audience}): ${plan.annualFee ? `từ ${formatMillion(plan.annualFee.min)}/năm, triển khai từ ${formatMillion(plan.setupFee!.min)}` : 'báo giá riêng'}`),
    '',
    '## Câu hỏi thường gặp',
    '',
    ...faq.items.map(({ q, a }) => `- ${q} ${a}`),
    '',
    '## Liên kết',
    '',
    `- [Trang giới thiệu PlanGo](${origin}/)`,
    `- [Bảng giá](${origin}/#bang-gia)`,
    `- [Đặt lịch demo](${origin}/#tu-van)`,
    '',
  ].join('\n');
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
