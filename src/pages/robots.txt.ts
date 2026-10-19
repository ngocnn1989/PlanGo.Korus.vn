import siteProfile from '../config/site-profile.mjs';

export const prerender = true;

export function GET() {
  const sitemap = new URL('/sitemap.xml', siteProfile.canonical_origin).toString();
  const body = siteProfile.indexable === true
    ? `User-agent: *\nDisallow: /api/\nDisallow: /_server/\n\nSitemap: ${sitemap}\n`
    : 'User-agent: *\nDisallow: /api/\nDisallow: /_server/\n';

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
