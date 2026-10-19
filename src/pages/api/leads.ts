import type { APIRoute } from 'astro';

import siteProfile from '../../config/site-profile.mjs';
import { resolveRuntimeLeadActivation } from '../../config/runtime-lead-activation.mjs';
import {
  getLeadDispatchPort,
  type LeadDispatchPort,
} from '../../utils/lead-dispatch/index.ts';
import { guardLeadRequest, type LeadRequestGuard } from '../../utils/lead-request.ts';

function unavailableResponse(): Response {
  return response(503, { success: false, code: 'lead_unavailable' });
}

function rejectedResponse(): Response {
  return response(502, { success: false, code: 'lead_provider_rejected' });
}

// WP8.6 - Trước đây toàn bộ src/ không có MỘT lệnh log server-side nào, và
// catch ngoài cùng ở dưới nuốt lỗi không dấu vết. Khi lead hỏng trên
// production, không có gì để chẩn đoán.
//
// Chỉ log dữ liệu vận hành: mã kết quả và correlation id. KHÔNG bao giờ log
// nội dung lead (tên, số điện thoại, email, nội dung, doanh nghiệp, nhóm ứng
// dụng) vì đó là dữ liệu cá nhân, và không log secret. Route này chuyển
// nguyên payload đã chuẩn hoá xuống dispatch port, không đọc từng trường.
function logLead(event: string, idempotencyKey: string | null, detail?: string): void {
  const record: Record<string, string> = {
    at: new Date().toISOString(),
    scope: 'lead',
    event,
  };
  if (idempotencyKey) record.correlation_id = idempotencyKey;
  if (detail) record.detail = detail;
  console.log(JSON.stringify(record));
}

function response(status: number, body: Record<string, boolean | string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

type LeadPostContext = {
  clientAddress: string | undefined;
  request: Request;
};

export type LeadPostHandler = (context: LeadPostContext) => Promise<Response>;

export function createLeadPostHandler({
  getDispatchPort,
  guard,
  resolveActivation = () => resolveRuntimeLeadActivation({ profile: siteProfile, env: {
    LEAD_PROVIDER: import.meta.env.LEAD_PROVIDER,
    GOOGLE_SHEET_WEBHOOK_URL: import.meta.env.GOOGLE_SHEET_WEBHOOK_URL,
    WEBHOOK_SECRET: import.meta.env.WEBHOOK_SECRET,
    LEAD_ALLOWED_ORIGINS: import.meta.env.LEAD_ALLOWED_ORIGINS,
  } }),
}: {
  getDispatchPort: () => LeadDispatchPort;
  guard: LeadRequestGuard;
  resolveActivation?: () => ReturnType<typeof resolveRuntimeLeadActivation>;
}): LeadPostHandler {
  return async ({ request, clientAddress }) => {
    const activation = resolveActivation();
    if (!activation.ok) {
      logLead('activation_invalid', null, activation.code);
      return response(503, { success: false, code: activation.code });
    }
    if (!activation.enabled) {
      logLead('activation_disabled', null);
      return unavailableResponse();
    }
    const outcome = await guard(request, clientAddress);

    if (outcome.kind === 'rejected') {
      logLead('guard_rejected', null, outcome.code);
      return response(outcome.status, { success: false, code: outcome.code });
    }

    try {
      const dispatch = await getDispatchPort().dispatch(outcome.payload, outcome.idempotencyKey);
      if (dispatch.kind === 'unavailable') {
        outcome.reservation.release();
        logLead('provider_unavailable', outcome.idempotencyKey);
        return unavailableResponse();
      }
      if (dispatch.kind === 'rejected') {
        outcome.reservation.release();
        logLead('provider_rejected', outcome.idempotencyKey);
        return rejectedResponse();
      }

      outcome.reservation.commit();
      logLead('accepted', outcome.idempotencyKey, dispatch.receiptId);
      return response(200, { success: true, receiptId: dispatch.receiptId });
    } catch (error) {
      outcome.reservation.release();
      // Catch ngoài cùng: trước đây nuốt lỗi hoàn toàn, không log, không
      // correlation id, dù idempotencyKey đang có sẵn trong scope.
      logLead('dispatch_threw', outcome.idempotencyKey, error instanceof Error ? error.name : 'unknown');
      return unavailableResponse();
    }
  };
}

export const POST: APIRoute = createLeadPostHandler({
  getDispatchPort: getLeadDispatchPort,
  guard: guardLeadRequest,
});
