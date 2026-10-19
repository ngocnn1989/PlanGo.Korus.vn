import type { MiddlewareHandler } from 'astro';

import siteProfile from './config/site-profile.mjs';
import { resolveRuntimeLeadActivation } from './config/runtime-lead-activation.mjs';
import { allowsProductionLeadOrigin } from './utils/lead-security.ts';

function deniedLeadResponse(): Response {
  return new Response(JSON.stringify({ code: 'lead_unavailable', success: false }), {
    status: 403,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

function unavailableLeadResponse(code: string): Response {
  return new Response(JSON.stringify({ code, success: false }), {
    status: 503,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  if (
    context.request.method !== 'POST' ||
    (context.url.pathname !== '/api/leads' && context.url.pathname !== '/api/leads/')
  ) {
    return next();
  }

  const resolution = resolveRuntimeLeadActivation({ profile: siteProfile, env: {
    LEAD_PROVIDER: import.meta.env.LEAD_PROVIDER,
    GOOGLE_SHEET_WEBHOOK_URL: import.meta.env.GOOGLE_SHEET_WEBHOOK_URL,
    WEBHOOK_SECRET: import.meta.env.WEBHOOK_SECRET,
    LEAD_ALLOWED_ORIGINS: import.meta.env.LEAD_ALLOWED_ORIGINS,
  } });
  if (!resolution.ok) return unavailableLeadResponse(resolution.code);
  if (!resolution.enabled || !allowsProductionLeadOrigin({
    environment: {
      allowedOrigins: resolution.allowedOrigins,
      prod: import.meta.env.PROD,
    },
    profile: {
      canonicalOrigin: siteProfile.canonical_origin,
      id: siteProfile.id,
      leadEnabled: resolution.enabled,
    },
    request: {
      origin: context.request.headers.get('origin'),
    },
  })) {
    return deniedLeadResponse();
  }

  return next();
};
