import siteProfile from '../../config/site-profile.mjs';
import { resolveRuntimeLeadActivation } from '../../config/runtime-lead-activation.mjs';
import type { NormalizedLeadPayload } from '../lead-request';

const ACK_BYTES = 1024;
const RECEIPT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type LeadDispatchResult =
  | { kind: 'accepted'; receiptId: string }
  | { kind: 'rejected' }
  | { kind: 'unavailable' };

export interface LeadDispatchPort {
  dispatch(payload: NormalizedLeadPayload, idempotencyKey: string): Promise<LeadDispatchResult>;
}

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function strictAck(text: string, idempotencyKey: string): string | null {
  const keys = [...text.matchAll(/(?:\{|,)\s*("(?:[^"\\]|\\.)*")\s*:/g)].map((match) => JSON.parse(match[1]));
  if (new Set(keys).size !== keys.length) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  const objectKeys = Object.keys(object).sort();
  if (objectKeys.join(',') === 'receiptId,success' && object.success === true
    && typeof object.receiptId === 'string' && RECEIPT_ID.test(object.receiptId)) return object.receiptId;
  if (objectKeys.join(',') === 'result,row' && object.result === 'success'
    && typeof object.row === 'number' && Number.isSafeInteger(object.row)
    && object.row >= 1 && object.row <= 2147483647) return `google-sheets-row:${object.row}`;
  // Apps Script chỉ trả {"ok":true} mà không kèm định danh bản ghi. Không được
  // suy diễn ra một receipt cố định: giá trị này chảy xuống tracking.ts làm
  // dedupe key, nên một hằng số sẽ khiến mọi lead trong cùng phiên bị gộp làm
  // một và chỉ lead đầu tiên được ghi nhận chuyển đổi. Dùng idempotencyKey vốn
  // đã là duy nhất cho mỗi lần gửi.
  if (objectKeys.join(',') === 'ok' && object.ok === true) return `google-sheets-ack:${idempotencyKey}`;
  return null;
}

async function readAcknowledgement(response: Response, idempotencyKey: string): Promise<string | null> {
  if (!response.ok || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > ACK_BYTES) return null;
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return strictAck(new TextDecoder('utf-8', { fatal: true }).decode(bytes), idempotencyKey);
  } catch {
    return null;
  }
}

export function createGoogleSheetsLeadDispatchPort({ endpoint, secret = '', fetchImplementation = fetch }: {
  endpoint: string;
  secret?: string;
  fetchImplementation?: FetchImplementation;
}): LeadDispatchPort {
  return {
    async dispatch(payload, idempotencyKey) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' });
      if (secret) headers.set('X-Korus-Webhook-Secret', secret);
      try {
        // Google Apps Script KHÔNG cho doPost(e) đọc HTTP header tùy chỉnh:
        // event object chỉ có queryString, parameter(s), pathInfo, contextPath,
        // contentLength, postData. Vì vậy X-Korus-Webhook-Secret bên dưới là
        // vô dụng với provider này - script phía Google không bao giờ thấy nó.
        // Gửi thêm secret trong body để Apps Script kiểm tra được bằng
        // e.parameter.webhook_secret. Header vẫn giữ để dùng với provider khác
        // có khả năng đọc header.
        //
        // company và application là tuỳ chọn. Tách riêng để khoá chỉ lên dây
        // khi thực sự có giá trị: spread thẳng một khoá undefined vào
        // URLSearchParams sẽ tạo ra chuỗi "undefined" ở phía tiếp nhận. Các
        // trường cũ giữ nguyên hành vi luôn-gửi để không đổi hợp đồng cột.
        const { company, application, province, ...core } = payload;
        const wire: Record<string, string> = {
          ...core,
          ...(company ? { company } : {}),
          ...(application ? { application } : {}),
          ...(province ? { province } : {}),
          idempotency_key: idempotencyKey,
          ...(secret ? { webhook_secret: secret } : {}),
        };
        const body = new URLSearchParams(wire);
        let response = await fetchImplementation(endpoint, {
          method: 'POST', headers, body, signal: controller.signal, redirect: 'follow', credentials: 'omit',
        });
        let receiptId = await readAcknowledgement(response, idempotencyKey);

        // Fallback sang JSON chỉ khi provider thực sự TỪ CHỐI request dạng
        // form-encoded. Trước đây điều kiện là `!receiptId`, nghĩa là một lần
        // ghi ĐÃ THÀNH CÔNG nhưng trả về ack lạ cũng kích hoạt POST thứ hai và
        // tạo ra dòng lead trùng. Response 2xx mà không đọc được ack thì phải
        // coi là rejected, không được gửi lại.
        if (!receiptId && !response.ok) {
          // Controller đầu tiên có thể đã abort; cần timeout riêng cho lần thử này.
          const jsonController = new AbortController();
          const jsonTimeout = setTimeout(() => jsonController.abort(), 5000);
          try {
            const jsonHeaders = new Headers({ 'Content-Type': 'application/json' });
            if (secret) jsonHeaders.set('X-Korus-Webhook-Secret', secret);
            const jsonResponse = await fetchImplementation(endpoint, {
              method: 'POST',
              headers: jsonHeaders,
              // Cùng một tập trường với lần gửi form-encoded, kể cả hai trường
              // tuỳ chọn, để hai đường không lệch dữ liệu nhau.
              body: JSON.stringify(wire),
              signal: jsonController.signal,
              redirect: 'follow',
              credentials: 'omit',
            });
            receiptId = await readAcknowledgement(jsonResponse, idempotencyKey);
          } catch {
            // Lần thử JSON thất bại: giữ nguyên receiptId null, đường trên sẽ
            // trả về 'rejected'. Không nuốt lỗi của lần gửi đầu tiên.
          } finally {
            clearTimeout(jsonTimeout);
          }
        }

        return receiptId ? { kind: 'accepted', receiptId } : { kind: 'rejected' };
      } catch {
        return { kind: 'unavailable' };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

class UnavailableLeadDispatchPort implements LeadDispatchPort {
  async dispatch(): Promise<LeadDispatchResult> { return { kind: 'unavailable' }; }
}

export function getLeadDispatchPort(): LeadDispatchPort {
  const resolution = resolveRuntimeLeadActivation({ profile: siteProfile, env: {
    LEAD_PROVIDER: import.meta.env.LEAD_PROVIDER,
    GOOGLE_SHEET_WEBHOOK_URL: import.meta.env.GOOGLE_SHEET_WEBHOOK_URL,
    WEBHOOK_SECRET: import.meta.env.WEBHOOK_SECRET,
    LEAD_ALLOWED_ORIGINS: import.meta.env.LEAD_ALLOWED_ORIGINS,
  } });
  // Keep a runtime endpoint check as well as the resolver's typed state
  // contract, so an invalid producer cannot activate the dispatch port.
  if (!resolution.ok || !resolution.enabled || typeof resolution.webhookUrl !== 'string') {
    return new UnavailableLeadDispatchPort();
  }
  return createGoogleSheetsLeadDispatchPort({
    endpoint: resolution.webhookUrl,
    secret: typeof resolution.webhookSecret === 'string' ? resolution.webhookSecret : '',
  });
}
