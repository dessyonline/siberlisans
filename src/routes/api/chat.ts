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

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body;
        try {
          body = await readJsonBody(request);
        } catch {
          return json({ ok: false, error: "Geçersiz JSON." }, 400);
        }

        const licenseKey = extractLicenseKey(request, body);
        const ip = clientIp(request);
        const ua = request.headers.get("user-agent") ?? "";

        // 1) licenseKey zorunlu
        if (!licenseKey) {
          return json({ ok: false, error: "licenseKey gerekli." }, 401);
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
          return json({ ok: false, error: verified.error }, 403);
        }

        // 3) message zorunlu
        const message = (body.message as string | undefined)?.toString().trim() ?? "";
        if (!message) {
          return json({ ok: false, error: "message gerekli." }, 400);
        }

        // 4) Rate limit
        if (!rateLimit("chat:" + licenseKey, 15, 60_000)) {
          return json({ ok: false, error: "Çok fazla istek. Lütfen bekleyin." }, 429);
        }

        const chatProxyUrl = (process.env.CHAT_PROXY_URL ?? "")
          .replace(/\/$/, "")
          .replace(/\/api$/, "");
        const projectId = (body.projectId as string | undefined)?.toString().trim() ?? "";

        // Proxy yapılandırılmamışsa veya projectId yoksa lisans-doğrulandı yanıtı
        if (!chatProxyUrl || !projectId) {
          return json({
            ok: true,
            response: "Lisans doğrulandı. " + (chatProxyUrl ? "projectId gerekli." : "Chat proxy yapılandırılmadı."),
            data: null,
          });
        }

        const token = (body.token as string | undefined) ?? "";
        const target = `${chatProxyUrl}/${projectId}/chat`;
        const upstreamBody = cleanProxyBody(body);
        try {
          const upstream = await fetch(target, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: "Bearer " + token } : {}),
            },
            body: JSON.stringify(upstreamBody),
          });
          const contentType = upstream.headers.get("content-type") ?? "";
          const raw = contentType.includes("application/json")
            ? await upstream.json()
            : await upstream.text();
          if (!upstream.ok) {
            return json(
              {
                ok: false,
                error:
                  typeof raw === "string"
                    ? raw.slice(0, 300)
                    : (raw as { error?: string })?.error ?? "Upstream hatası.",
              },
              upstream.status,
            );
          }
          return json({ ok: true, response: null, data: raw });
        } catch (e) {
          return json({ ok: false, error: (e as Error).message }, 502);
        }
      },
    },
  },
});
