# Sổ tay triển khai Web

> **Phiên bản tài liệu:** 2026-09-07 · **Chủ sở hữu:** owner dự án · **Trạng thái:** active
>
> Tài liệu này đã được re-root ngày 2026-09-07 theo phương án B của kế hoạch
> khắc phục. Trước đó nó mô tả một layout monorepo có tiền tố `web/` không tồn
> tại trong kho này (46 tham chiếu trên 17 dòng, 0/30 đường dẫn resolve được),
> và route map trích dẫn các file blog/product **chưa từng tồn tại trong bất kỳ
> commit nào**. Xem `docs/audit/2026-09-07_Comprehensive_audit_report.md`.

Tài liệu này dành cho đội vận hành và nội dung. Nó mô tả cách dùng khung hiện có cùng công cụ xuất bản, CI và triển khai bên ngoài đã được chủ sở hữu phê duyệt. Đây là hướng dẫn thao tác; không phải lệnh triển khai hay quyền triển khai.

## 1. Purpose and boundaries (Mục đích và ranh giới)

Kho mã này là ranh giới framework cục bộ, không phải CMS, control plane hay giao diện quản trị. Không có giao diện Git, triển khai hoặc rollback nội bộ.

Từ 2026-09-07 kho có một workflow CI kiểm chứng tại `.github/workflows/ci.yml`. Workflow này CHỈ chạy cổng kiểm chứng, typecheck và build; nó không publish, không deploy và không cấp quyền triển khai. Việc triển khai vẫn do Vercel thực hiện khi nhận push, theo cấu hình của chủ sở hữu. Công cụ xuất bản, CI và triển khai bên ngoài do chủ sở hữu quản lý là authority duy nhất cho mọi hành động từ xa.

Các bằng chứng framework trực tiếp: `src/config/site-profile.schema.mjs`, `src/config/site-profile.loader.mjs`, `src/content.config.ts`, `src/components/seo/SeoHead.astro`, `src/config/runtime-tracking-activation.mjs`, `src/config/runtime-lead-activation.mjs`, `astro.config.mjs`, và bộ cổng kiểm chứng chạy bằng `npm run verify` (11 script trong `scripts/`).

Lưu ý: `scripts/verify-framework-ci.mjs` KHÔNG nằm trong bộ cổng đang chạy. Nó là tàn dư từ monorepo gốc, allowlist còn tiền tố `web/` nên không thể pass trong kho này. Đừng viện dẫn nó làm bằng chứng.

## 2. Before you begin (Trước khi bắt đầu)

- Chủ sở hữu xác nhận tên site/profile, nội dung công khai đã phê duyệt, tài sản thương hiệu và quyền sử dụng.
- Ghi nhận owner của công cụ xuất bản bên ngoài, CI và triển khai; họ không dùng chung credential và không tự phê duyệt công việc của mình.
- Chuẩn bị một tham chiếu rollback bất biến đã biết là tốt.
- Khi dùng một trang tham chiếu hoặc yêu cầu clone giao diện, phải có quyền thương hiệu/pháp lý và chỉ dùng nó làm tài liệu tham khảo trực quan.

Không sao chép website không có quyền, mã nguồn, bundle runtime, script bên thứ ba, tracking tag hoặc tài sản không được cấp phép.

Đường đi nhanh không-CMS cho đội không chuyên IT: gửi copy, asset và Markdown/proof đã duyệt cho content owner hoặc operator được chỉ định. Đội nội dung không cần quyền repo, cấu hình server, credential hay quyền publish; operator chuyển artifact qua ranh giới external Publisher đã được phê duyệt.

## 3. UI clone, home page and main pages (Clone UI, trang chủ và trang chính)

Quy trình là khám phá thiết kế được phép, duyệt copy/tài sản, rồi ánh xạ vào JSON profile: `page_copy`, `theme_tokens`, `navigation`, thương hiệu và các route hiện có. Trang chủ dùng `src/pages/index.astro` và `src/layouts/LandingLayout.astro`.

Clone là bài tập visual/reference, không phải sao chép runtime, source bundle, script, tracking hay asset của bên thứ ba. Không tạo route, chức năng hay quyền mới chỉ vì chúng xuất hiện trong trang tham chiếu.

### Route map hiện tại

| Nhóm | Route hoặc chức năng | Source-code evidence |
|---|---|---|
| UI clone/trang chính | `/` | `src/pages/index.astro`, `src/layouts/LandingLayout.astro` |
| Nội dung | Điều khoản sử dụng `/terms` | `src/pages/terms.astro`, `src/layouts/LandingLayout.astro` |
| Nội dung | Chính sách bảo mật `/privacy` | `src/pages/privacy.astro`, `src/layouts/LandingLayout.astro` |
| Technical error | 404 và 500 | `src/pages/404.astro`, `src/pages/500.astro` |
| Technical discovery | robots | `src/pages/robots.txt.ts` |
| Technical/API | Lead API route | `src/pages/api/leads.ts` |

Chỉ có một route UI clone là `/`. Các route điều khoản, error, robots và API là route nội dung hoặc kỹ thuật; chúng không phải phạm vi sao chép UI.

## 4. Logo and assets (Logo và tài sản)

Lưu asset đã được duyệt trong `public/`. Khai báo logo, favicon, copy và token qua trường JSON profile phù hợp; loader/schema kiểm tra profile JSON nghiêm ngặt. Đường dẫn phải cục bộ, an toàn, đúng chữ hoa/thường và có alt text thích hợp.

Kiểm tra quyền sử dụng, kích thước responsive, nén ảnh và ngân sách font/ảnh trước khi go-live. Không fetch asset từ xa, không nhúng credential, và không dùng đường dẫn case-insensitive như thể đó là hợp lệ trên mọi môi trường.

## 5. Articles and content handoff (Bài viết và bàn giao nội dung)

Soạn bài bằng Markdown thân thiện với text editor. Luồng chuẩn dùng `scripts/materialize-source-ready-article-handoff.mjs` và được kiểm tra bởi `scripts/verify-source-ready-article-handoff.mjs`: Writer chuẩn bị bản nháp, AI Auditor độc lập kiểm tra bằng chứng, rồi external Publisher do owner kiểm soát nhận artifact.

Không dùng MDX/JSX tùy ý, import, script hoặc raw HTML. Framework agent không ghi trực tiếp vào Git; Publisher bên ngoài xử lý việc commit/publish theo policy của chính công cụ đó.

## 6. Lead form (Biểu mẫu lead)

Lead form chỉ hiện khi cấu hình server được chấp nhận kích hoạt; `src/components/global/LeadModal.astro`, `src/pages/api/leads.ts`, `src/utils/lead-request.ts` và `src/utils/lead-security.ts` là các điểm bằng chứng. Khi môi trường hợp lệ, lead tự kích hoạt ngay cả khi profile JSON cũ không bật lead. Cấu hình thiếu, lẫn hoặc sai phải fail-loud; không được tắt ngầm.

Vận hành chỉ kiểm tra trạng thái an toàn: acknowledgement hợp lệ, origin, rate limit, idempotency và honeypot. Không hứa hẹn giao hàng tới hệ thống bên ngoài, không suy diễn receipt, và không coi HTTP thành công đơn thuần là thành công nghiệp vụ.

## 7. SEO, Ads, tracking and consent (SEO, Ads, tracking và consent)

Canonical, robots, Open Graph và cấu trúc article lấy từ profile đã chọn và dữ liệu bài viết; xem `src/components/seo/SeoHead.astro`, `scripts/verify-article-route-seo.mjs` và `scripts/verify-seo-truth.mjs`. Staging không phải xác nhận go-live.

Các biến tracking chỉ được nêu tên: `SITE_PROFILE`, `PUBLIC_ENABLE_TRACKING`, `PUBLIC_GTM_ID`, `PUBLIC_TRACKING_DELAY_MS`. Khi môi trường tracking hợp lệ, tracking tự kích hoạt theo resolver; cấu hình dở dang hoặc sai phải fail-loud, không được tắt ngầm. `PUBLIC_ENABLE_TRACKING=false` là override tắt rõ ràng.

Tracking vẫn default-deny: `src/components/tracking/TrackingConsent.astro` yêu cầu người dùng accept, reject hoặc revoke; `src/components/tracking/TrackingProvider.astro` không được inject hay collect trước consent gate. Tracking delay chỉ là thời điểm sau khi điều kiện hợp lệ được thỏa mãn, không thay thế consent.

## 8. Lead configuration names only (Chỉ tên cấu hình lead)

Các tên cấu hình server-only là `LEAD_PROVIDER`, `GOOGLE_SHEET_WEBHOOK_URL`, `WEBHOOK_SECRET`, `LEAD_ALLOWED_ORIGINS`. Không đưa giá trị, endpoint, ví dụ secret, credential hay hướng dẫn dashboard vào Markdown, profile hoặc client.

Resolver tại `src/config/runtime-lead-activation.mjs` chấp nhận cấu hình hoàn chỉnh và fail-loud cho cấu hình không đầy đủ hoặc malformed. Secret chỉ được xử lý ở server; không serialize, prop-pass, log hoặc trả về client. Trước khi thao tác, owner/operator phải dùng quy trình bảo mật đã phê duyệt của công cụ bên ngoài.

## 9. First deployment vs go-live (Triển khai đầu tiên và go-live)

First deployment là bằng chứng staging/preview qua công cụ bên ngoài: CI và deployment reference bất biến được ghi nhận để review. Nó không phải go-live. Go-live là promotion production riêng, chỉ sau khi owner xác nhận checklist và ủy quyền rõ ràng.

Neither action is performed by this repository or this handbook. Không coi build local, staging profile hoặc preview là quyền triển khai production.

### Checklist first deployment (external-tool-only)

- Xác nhận input/reference đã được duyệt và lưu immutable.
- Xác nhận external CI đã pass đối với commit được chọn.
- External operator thực hiện staging route smoke cho route chính và technical route cần thiết.
- Review selected profile cùng trạng thái SEO, consent, tracking và lead trên staging.
- Đính kèm audit/policy evidence đã được duyệt.
- Lưu immutable commit, CI và deployment references để truy vết.
- Kết luận rõ đây là **not go-live**; owner mới quyết định bước go-live tiếp theo.

## 10. External Git publisher/CI boundary (Ranh giới Publisher Git/CI bên ngoài)

Công cụ bên ngoài nhận Markdown/proof đã được duyệt, commit/publish theo approval và provenance policy của nó, chạy CI, rồi trả về các reference commit, CI và deployment bất biến. Framework không sao chép Publisher này.

Nếu tổ chức cần phân vai, có thể tách chung thành design/content, source review và publish operator. Không chia sẻ credential, không tự phê duyệt, không cần tạo agent mới từ framework, và không cấp quyền xuất bản cho người soạn nội dung.

### Mẫu task cộng tác nhanh

| Thành phần | Nội dung phải ghi rõ |
|---|---|
| Objective | Kết quả hữu hạn cần đạt và tiêu chí chấp nhận. |
| Input/predecessor | Input đã được duyệt, task trước đó và bằng chứng sẵn có. |
| Exact write set | Danh sách path được phép tạo hoặc sửa, không suy diễn thêm. |
| Forbidden actions | Các thao tác, authority và path bị cấm. |
| Dependency/exit | Dependency còn thiếu và điều kiện dừng hoặc chuyển lane. |
| Worker self-check | Các kiểm tra offline, vector và readback mà worker phải tự chạy. |
| Independent QC | Kiểm tra độc lập, người chịu trách nhiệm và tiêu chí pass. |
| Handoff/rollback | Bằng chứng bàn giao, owner nhận và đường rollback đã được duyệt. |

External owner là bên duy nhất phân công worker và quyết định task tiếp theo. Không tự spawn agent, không trao đổi credential trong handoff, và không biến mẫu này thành quyền chạy CI, publish hoặc deploy.

## 11. Go-live checklist (Checklist go-live)

- Profile JSON được schema/loader xác minh; ID, copy, navigation, theme và local asset đã review.
- Markdown/proof được Writer, AI Auditor độc lập và external Publisher review theo vai trò tách biệt.
- Canonical, robots, indexability, Open Graph và article structure đúng với profile/dữ liệu được chọn.
- Consent UI, trạng thái tracking và explicit override được kiểm tra; không có collect trước consent.
- Lead configuration an toàn, hoàn chỉnh và fail-loud khi không hợp lệ; không ghi nhận delivery giả.
- CI bên ngoài pass và có reference bất biến; accessibility/performance manual checks hoàn tất.
- Owner phê duyệt promotion và tham chiếu rollback last-known-good có sẵn.

## 12. Rollback and incident response (Rollback và ứng phó sự cố)

Dừng promotion khi có sự cố. External operator dùng last-known-good immutable reference, bảo toàn bằng chứng và chỉ disable/withdraw qua công cụ bên ngoài. Không sửa generated output, không tạo rollback UI trong repo và không mô tả một rollback chưa được owner ủy quyền là đã xảy ra.

## 13. Security, performance and accessibility (Bảo mật, hiệu năng và khả năng truy cập)

Áp dụng least privilege. Không để secret trong client, JSON profile, Markdown hoặc log; không làm yếu CSP và không thêm third-party script nếu chưa có hợp đồng riêng. Form/error phải tránh lộ dữ liệu cá nhân.

Kiểm tra keyboard navigation, label, alt text, contrast và trạng thái focus. Giữ ngân sách ảnh/font, nén asset cục bộ và thực hiện manual performance/accessibility checks trước go-live. `scripts/normalize-vercel-csp-routes.mjs` là guard CSP hiện có, chạy tự động ở bước `postbuild`. Nó fail-closed: từ chối wildcard, `unsafe-inline` trong `script-src`, và mọi origin ngoài `ORIGIN_POLICY`. Cần thêm origin quảng cáo thì mở rộng allowlist đó, KHÔNG vô hiệu hóa guard. Đây không phải quyền nới CSP hay quyền triển khai.

## 14. What this framework deliberately does not do (Những việc framework chủ động không làm)

Framework không cung cấp CMS, visual editor, media library, admin auth, internal database, GitHub publisher, deploy/rollback UI, domain/env manager, provider control plane, tự provisioning, quản lý credential hoặc remote-provider action. Tuy vậy, environment hợp lệ làm local lead/tracking resolver và UI eligible theo source hiện có; tracking vẫn chờ consent gate, còn lead chỉ thành công sau server acknowledgement hợp lệ. Cấu hình thiếu hoặc sai phải fail-loud, và valid environment không bị diễn giải lại là disabled. Các authority còn lại thuộc owner và external operator được ủy quyền.

## Ma trận công việc và điểm thoát

| Stage | Owner | Dependency / exit |
|---|---|---|
| Intake and approved reference | owner/content team | rights, copy, assets, rollback target known |
| JSON profile + pages/assets | web builder | strict profile/schema and local asset review |
| Markdown/proof handoff | Writer + independent AI Auditor + external Publisher | attested candidate accepted; no self-attestation |
| Local/source checks | operator | documented verifier/build outcomes accepted |
| First deployment | external publisher/deploy operator | immutable CI/deployment evidence, not go-live |
| Go-live | owner + external operator | owner approval and checklist complete |
| Rollback/incident | external operator | last-known-good reference available |

## Nguồn kiểm chứng trong kho

- Profile JSON: `src/config/site-profile.schema.mjs`, `src/config/site-profile.loader.mjs`, `src/config/profiles/staging.json`.
- Trang/layout/tài sản: `src/pages/index.astro`, `src/pages/terms.astro`, `src/layouts/BaseLayout.astro`, `src/layouts/LandingLayout.astro`, `src/components/global/LeadModal.astro`, `src/components/custom/RoiCalculator.astro`, `public/`.
- Nội dung, SEO, consent, lead và CSP: các source/verifier được liệt kê trong từng section ở trên.

Tài liệu chỉ mô tả ranh giới hiện có. Mọi thay đổi source, credential, quyền provider, CI, publish, deploy hoặc production promotion cần một authority và hợp đồng riêng.
