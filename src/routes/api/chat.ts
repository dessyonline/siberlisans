import { createFileRoute } from "@tanstack/react-router";
import {
  CORS,
  cleanProxyBody,
  clientIp,
  extractLicenseKey,
  json,
  rateLimit,
  readJsonBody,
  verifyLicense,
} from "@/lib/license-feature.server";
import { logEvent } from "@/lib/license-api.server";

// POST /api/chat
// Body: { licenseKey, message, projectId? }
// 401 licenseKey yok, 400 message yok, 403 geçersiz/expired/revoked lisans.

function createRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function chatJson(body: Record<string, unknown>, status = 200, requestId?: string) {
  const response = json(requestId ? { ...body, requestId } : body, status);
  if (requestId) response.headers.set("X-Request-ID", requestId);
  return response;
}

function safePath(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return url.pathname;
  } catch {
    return rawUrl.replace(/^https?:\/\/[^/]+/i, "").split("?")[0] || "/";
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const requestId = createRequestId();
        console.log(`[api/chat][${requestId}] incoming POST ${safePath(request.url)}`);

        let body;
        try {
          body = await readJsonBody(request);
        } catch {
          console.warn(`[api/chat][${requestId}] invalid JSON body`);
          return chatJson({ ok: false, error: "Geçersiz JSON." }, 400, requestId);
        }

        const licenseKey = extractLicenseKey(request, body);
        const ip = clientIp(request);
        const ua = request.headers.get("user-agent") ?? "";

        // 1) licenseKey zorunlu
        if (!licenseKey) {
          console.warn(`[api/chat][${requestId}] missing licenseKey`);
          return chatJson({ ok: false, error: "licenseKey gerekli." }, 401, requestId);
        }

        // 2) Lisans doğrulama → geçersiz/expired/revoked = 403
        const verified = await verifyLicense(licenseKey);
        if (!verified.ok) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await logEvent(supabaseAdmin as never, {
            license_key: licenseKey,
            event: "fail",
            hwid: null,
            ip,
            user_agent: ua,
            detail: "chat:" + verified.error,
          });
          console.warn(`[api/chat][${requestId}] license rejected: ${verified.error}`);
          return chatJson({ ok: false, error: verified.error }, 403, requestId);
        }

        // 3) message zorunlu
        const message = (body.message as string | undefined)?.toString().trim() ?? "";
        if (!message) {
          console.warn(`[api/chat][${requestId}] missing message`);
          return chatJson({ ok: false, error: "message gerekli." }, 400, requestId);
        }

        // 4) Rate limit
        if (!rateLimit("chat:" + licenseKey, 15, 60_000)) {
          console.warn(`[api/chat][${requestId}] rate limited`);
          return chatJson({ ok: false, error: "Çok fazla istek. Lütfen bekleyin." }, 429, requestId);
        }

        const chatProxyUrl = (process.env.CHAT_PROXY_URL ?? "")
          .replace(/\/$/, "")
          .replace(/\/api$/, "");
        const projectId = (body.projectId as string | undefined)?.toString().trim() ?? "";

        // Proxy yapılandırılmamışsa veya projectId yoksa lisans-doğrulandı yanıtı
        if (!chatProxyUrl || !projectId) {
          console.log(
            `[api/chat][${requestId}] no upstream call: ${chatProxyUrl ? "missing projectId" : "CHAT_PROXY_URL not configured"}`,
          );
          return chatJson({
            ok: true,
            response: "Lisans doğrulandı. " + (chatProxyUrl ? "projectId gerekli." : "Chat proxy yapılandırılmadı."),
            data: null,
          }, 200, requestId);
        }

        const token = (body.token as string | undefined) ?? "";
        const target = `${chatProxyUrl}/${projectId}/chat`;
        const targetPath = safePath(target);
        const upstreamBody = cleanProxyBody(body);
        try {
          console.log(`[api/chat][${requestId}] upstream request POST ${targetPath}`);
          const upstream = await fetch(target, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: "Bearer " + token } : {}),
            },
            body: JSON.stringify(upstreamBody),
          });
          console.log(`[api/chat][${requestId}] upstream response POST ${targetPath} status=${upstream.status}`);
          const contentType = upstream.headers.get("content-type") ?? "";
          const raw = contentType.includes("application/json")
            ? await upstream.json()
            : await upstream.text();
          if (!upstream.ok) {
            if (upstream.status === 404) {
              return chatJson(
                {
                  ok: false,
                  error: "Upstream chat service returned 404",
                  upstreamPath: targetPath,
                  upstreamStatus: upstream.status,
                },
                502,
                requestId,
              );
            }
            return chatJson(
              {
                ok: false,
                error:
                  typeof raw === "string"
                    ? raw.slice(0, 300)
                    : (raw as { error?: string })?.error ?? "Upstream hatası.",
                upstreamPath: targetPath,
                upstreamStatus: upstream.status,
              },
              upstream.status >= 500 ? 502 : upstream.status,
              requestId,
            );
          }
          return chatJson({ ok: true, response: null, data: raw, upstreamPath: targetPath, upstreamStatus: upstream.status }, 200, requestId);
        } catch (e) {
          console.error(`[api/chat][${requestId}] upstream fetch failed POST ${targetPath}:`, (e as Error).message);
          return chatJson({ ok: false, error: (e as Error).message, upstreamPath: targetPath }, 502, requestId);
        }
      },
    },
  },
});
