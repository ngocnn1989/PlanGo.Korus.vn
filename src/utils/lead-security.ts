export type LeadSecurityEnvironment = {
  allowedOrigins: readonly string[];
  prod: boolean;
};

export type LeadSecurityProfile = {
  canonicalOrigin: string;
  id: string;
  leadEnabled: boolean;
};

export type LeadSecurityRequest = {
  origin: string | null;
};

export type ProductionLeadOriginFacts = {
  environment: LeadSecurityEnvironment;
  profile: LeadSecurityProfile;
  request: LeadSecurityRequest;
};

function normalizeHttpsOrigin(value: string): string | undefined {
  try {
    const origin = new URL(value.trim());

    return (
      origin.protocol === 'https:' &&
      !origin.username &&
      !origin.password &&
      origin.pathname === '/' &&
      !origin.search &&
      !origin.hash
    ) ? origin.origin : undefined;
  } catch {
    return undefined;
  }
}

// Kiểm soát origin dựa trên LEAD_ALLOWED_ORIGINS, KHÔNG dựa trên canonical_origin.
//
// Bản cũ bắt buộc requestOrigin === canonicalOrigin. Điều đó trộn lẫn hai thứ khác
// hẳn nhau: canonical là khái niệm SEO (URL nào được index), còn allowlist mới là
// kiểm soát bảo mật (origin nào được gửi lead). Hệ quả là trang chỉ phục vụ được
// đúng một domain — đổi canonical là form chết, và không thể chạy song song
// domain thật với domain xem trước. Sự cố đã xảy ra hai lần trên production
// (10/09: canonical trỏ weldbot.tech khi trang chạy ở vercel.app, và ngược lại).
//
// Allowlist vẫn là kiểm soát đủ mạnh: nó do biến môi trường phía máy chủ quyết
// định, client không tác động được, và mỗi origin vẫn phải qua normalizeHttpsOrigin
// (bắt buộc https, không userinfo, không path/query/fragment).
export function allowsProductionLeadOrigin({ environment, profile, request }: ProductionLeadOriginFacts): boolean {
  const requestOrigin = request.origin ? normalizeHttpsOrigin(request.origin) : undefined;
  const allowedOrigins = new Set(
    environment.allowedOrigins
      .map((value) => normalizeHttpsOrigin(value))
      .filter((value): value is string => value !== undefined),
  );

  return (
    environment.prod === true &&
    profile.leadEnabled === true &&
    requestOrigin !== undefined &&
    allowedOrigins.size > 0 &&
    allowedOrigins.has(requestOrigin) === true
  );
}
