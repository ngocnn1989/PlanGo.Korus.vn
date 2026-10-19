import siteProfile from '../config/site-profile.mjs';
import { airobotProduct } from '../content/airobot-product';
import { landingCopySource } from '../content/landing-copy';

export const prerender = true;

/** Optional reference for readers that use llms.txt; not a Google ranking signal. */
export function GET() {
  const { name, description, referenceTitle, referenceNote, specifications, source } = airobotProduct;
  const { footer, ungDung, nenTang } = landingCopySource;
  const text = [
    `# VN-J — ${name}`,
    '',
    `> ${description}`,
    '',
    '## Doanh nghiệp và liên hệ',
    '',
    `- Đơn vị thiết kế, chế tạo: ${footer.legalName}`,
    `- Địa chỉ: ${footer.address}`,
    `- Hotline tư vấn trên landing: ${siteProfile.contact.phone.display}`,
    ...nenTang.stats.map(({ value, note }) => `- ${value}: ${note}`),
    '',
    `## ${referenceTitle}`,
    '',
    referenceNote,
    '',
    ...specifications.map(({ label, value }) => `- ${label}: ${value}`),
    '',
    '## Các cụm chính của hệ robot',
    '',
    ...airobotProduct.components.map(({ label }) => `- ${label}`),
    '',
    '## Điểm nổi bật',
    '',
    ...airobotProduct.features.map(({ h3, body }) => `- ${h3}: ${body}`),
    '',
    '## Nhóm ứng dụng',
    '',
    ...ungDung.cards.map(({ h3, body }) => `- ${h3}: ${body}`),
    '',
    '## Nguồn và thông tin chi tiết',
    '',
    `- [Trang giới thiệu AiRobot](${siteProfile.canonical_origin}/): thông số tham chiếu, ứng dụng và câu hỏi thường gặp.`,
    `- [Công bố sản phẩm của VN-J](${source}): nguồn kỹ thuật của cấu hình tham chiếu.`,
    `- [Liên hệ tư vấn](${siteProfile.canonical_origin}/#tu-van): trao đổi cấu hình và phạm vi cung cấp.`,
    '',
  ].join('\n');
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
