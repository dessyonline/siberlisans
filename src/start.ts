import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const API_METHODS: Record<string, readonly string[]> = {
  "/api/revoke": ["POST", "OPTIONS"],
  "/api/sync": ["POST", "OPTIONS"],
  "/api/admin/create": ["POST", "OPTIONS"],
  "/api/admin/revoke": ["POST", "OPTIONS"],
  "/api/source-code": ["GET", "POST", "OPTIONS"],
  "/api/public/hooks/catalog-webhooks": ["POST"],
  "/api/public/hooks/telegram": ["POST"],
};

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https:; script-src 'self' 'unsafe-inline' https://telegram.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; frame-src 'self' https:;",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function methodNotAllowed(allowed: readonly string[]): Response {
  return withSecurityHeaders(
    new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Allow: allowed.join(", "),
      },
    }),
  );
}

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/lovable/") || url.pathname === "/email/unsubscribe") {
    return withSecurityHeaders((await next()).response);
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const allowed = API_METHODS[path];
  if (allowed && !allowed.includes(request.method)) return methodNotAllowed(allowed);
  try {
    return withSecurityHeaders((await next()).response);
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return withSecurityHeaders(new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    }));
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
