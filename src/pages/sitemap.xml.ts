import type { APIRoute } from 'astro';

import siteProfile from '../config/site-profile.mjs';

export const prerender = true;

// Sitemap một cấp, phẳng: chỉ một file /sitemap.xml thay cho cặp
// sitemap-index.xml + sitemap-0.xml của @astrojs/sitemap. Trang này ít URL nên
// không cần chia mảnh, và một cấp dễ khai báo trong Search Console hơn.
//
// Chỉ liệt kê trang công khai, cho index và có liên kết nội bộ trỏ tới (không
// mồ côi). /thank-you cố tình noindex nên KHÔNG nằm đây; /api, /404, /500,
// /llms.txt, /robots.txt cũng không phải trang nội dung để index.
const INDEXABLE_PATHS = ['/', '/privacy/', '/terms/'];

export const GET: APIRoute = () => {
  const origin = siteProfile.canonical_origin;
  const paths = siteProfile.indexable === true ? INDEXABLE_PATHS : [];
  const entries = paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}${entries ? '\n' : ''}</urlset>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
