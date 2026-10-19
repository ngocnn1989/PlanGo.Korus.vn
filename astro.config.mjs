import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import { createSiteProfileVirtualPlugin, loadSiteProfile } from './src/config/site-profile.loader.mjs';

const siteProfile = await loadSiteProfile();
const siteProfileVirtualPlugin = createSiteProfileVirtualPlugin(siteProfile);

export default defineConfig({
  // Astro's dev toolbar injects an inline bootstrap that violates script-src.
  // Hide the optional toolbar; keep the site's script policy unchanged.
  devToolbar: { enabled: false },
  site: siteProfile.canonical_origin,
  trailingSlash: 'always',
  output: 'server',
  adapter: vercel({ staticHeaders: true }),
  // Không nội tuyến CSS. Mặc định 'auto' của Astro nhúng stylesheet nhỏ thành
  // thẻ <style> nội tuyến; hash mà security.csp ghi vào header CSP tĩnh lại
  // lệch với nội dung <style> thật sau khi Vite xử lý, nên style-src-elem chặn
  // đúng khối CSS đó (rõ nhất là CSS của popup LeadModal). Đẩy toàn bộ CSS ra
  // file .css ngoài (tải qua <link>, hợp lệ với style-src 'self') để không còn
  // <style> nội tuyến nào phải hash — hết cả lỗi console lẫn vỡ giao diện popup.
  build: { inlineStylesheets: 'never' },
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        // Meta Pixel gửi sự kiện bằng cách POST form ẩn tới www.facebook.com/tr/.
        // Với 'self' thì mọi PageView/Lead của Meta bị chặn âm thầm ở form-action
        // — pixel tải được nhưng Events Manager không nhận hoạt động nào.
        "form-action 'self' https://www.facebook.com",
        // GA4 và Facebook Pixel gửi hit tới các origin khác GTM. Thiếu chúng
        // thì GTM vẫn tải được nhưng mọi hit đo lường bị chặn âm thầm.
        // capi-automation.s3...: nơi param builder (CAPI) gửi tham số đã dựng.
        "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://www.facebook.com https://connect.facebook.net https://capi-automation.s3.us-east-2.amazonaws.com",
        // img-src 'self' data: sẽ chặn pixel fallback của GA4 và Meta.
        "img-src 'self' data: https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://www.facebook.com https://googleads.g.doubleclick.net",
        "font-src 'self' data:",
        // Meta Pixel dựng iframe ẩn tới www.facebook.com để đồng bộ định danh
        // (_fbp/_fbc). Thiếu origin này thì pixel không ghép được sự kiện với
        // người dùng và một phần luồng gửi sự kiện hỏng.
        'frame-src https://www.googletagmanager.com https://www.facebook.com',
      ],
      scriptDirective: {
        // capi-automation.s3...: script param builder của Meta (CAPI) do mẫu
        // Meta Pixel chèn thêm. Thiếu origin này thì script bị chặn ở script-src.
        resources: ["'self'", 'https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://capi-automation.s3.us-east-2.amazonaws.com'],
      },
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
    },
  },
  // Partytown đã được gỡ (WP4.1). Ba lý do, đều đo được:
  //  1. nó đăng ký Service Worker + hidden iframe trên MỌI page load, TRƯỚC
  //     consent, kể cả khi tracking tắt - thứ duy nhất ghi vào thiết bị người
  //     dùng trước khi hỏi ý kiến;
  //  2. nó chỉ snapshot script text/partytown một lần và không có
  //     MutationObserver, nên script được gate bởi consent (append sau) không
  //     bao giờ chạy - với delay mặc định 2000ms thì GTM gần như chắc chắn chết;
  //  3. nó chiếm ~90% toàn bộ client JS trong khi JS first-party chỉ ~10 KB.
  integrations: [
    // Sitemap do route thủ công src/pages/sitemap.xml.ts phát ra (một cấp,
    // phẳng: /sitemap.xml). @astrojs/sitemap đã được gỡ vì nó luôn tạo cặp
    // sitemap-index.xml + sitemap-0.xml, thừa một cấp cho trang ít URL này.
    {
      name: 'local-vite-styles',
      hooks: {
        'astro:config:setup': ({ command, updateConfig }) => {
          // Vite injects style elements in dev. The production build keeps
          // the existing hashed/external style policy and all other guards.
          if (command === 'dev') updateConfig({ security: { csp: {
            styleDirective: { resources: [
              { resource: "'self'", kind: 'element' },
              { resource: "'unsafe-inline'", kind: 'element' },
            ] },
          } } });
        },
      },
    },
  ],
  vite: {
    plugins: [tailwindcss(), siteProfileVirtualPlugin],
  },
});
