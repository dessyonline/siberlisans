import { createFileRoute } from "@tanstack/react-router";
import {
  CORS,
  clientIp,
  extractLicenseKey,
  json,
  rateLimit,
  readJsonBody,
  verifyLicense,
} from "@/lib/license-feature.server";
import { logEventMysql } from "@/lib/license-mysql.server";

// POST /api/chat
// Body: { licenseKey, message, history? }
// 401 licenseKey yok, 400 message yok, 403 geçersiz/expired/revoked lisans.
// Doğrulanmış lisansla Lovable AI Gateway'e (google/gemini-2.5-flash) proxy'ler.

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

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

const SYSTEM_PROMPT =
  "Sen xSiberPHPx eklentisinin yardımcı asistanısın. Kullanıcıya kısa, net ve Türkçe cevaplar ver. Kod önerilerini markdown ile biçimlendir.";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const requestId = createRequestId();

        let body: Record<string, unknown>;
        try {
          body = (await readJsonBody(request)) as Record<string, unknown>;
        } catch {
          return chatJson({ ok: false, error: "Geçersiz JSON." }, 400, requestId);
        }

        const licenseKey = extractLicenseKey(request, body);
        const ip = clientIp(request);
        const ua = request.headers.get("user-agent") ?? "";

        if (!licenseKey) {
          return chatJson({ ok: false, error: "licenseKey gerekli." }, 401, requestId);
        }

        const verified = await verifyLicense(licenseKey);
        if (!verified.ok) {
          await logEventMysql({
            license_key: licenseKey,
            event: "fail",
            hwid: null,
            ip,
            user_agent: ua,
            detail: "chat:" + verified.error,
          });
          return chatJson({ ok: false, error: verified.error }, 403, requestId);
        }

        const message = (body.message as string | undefined)?.toString().trim() ?? "";
        if (!message) {
          return chatJson({ ok: false, error: "message gerekli." }, 400, requestId);
        }

        if (!rateLimit("chat:" + licenseKey, 15, 60_000)) {
          return chatJson({ ok: false, error: "Çok fazla istek. Lütfen bekleyin." }, 429, requestId);
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          console.error(`[api/chat][${requestId}] LOVABLE_API_KEY missing`);
          return chatJson({ ok: false, error: "AI servisi yapılandırılmamış." }, 500, requestId);
        }

        // İsteğe bağlı geçmiş
        const rawHistory = Array.isArray(body.history) ? (body.history as unknown[]) : [];
        const history: ChatMsg[] = rawHistory
          .filter((m): m is { role: string; content: string } =>
            !!m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string",
          )
          .slice(-10)
          .map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content).slice(0, 4000),
          }));

        const messages: ChatMsg[] = [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: message.slice(0, 8000) },
        ];

        const model =
          (body.model as string | undefined)?.toString().trim() || "google/gemini-2.5-flash";

        try {
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ model, messages, temperature: 0.7 }),
          });

          const contentType = upstream.headers.get("content-type") ?? "";
          const raw = contentType.includes("application/json")
            ? await upstream.json()
            : await upstream.text();

          if (!upstream.ok) {
            const errMsg =
              typeof raw === "string"
                ? raw.slice(0, 300)
                : (raw as { error?: { message?: string }; message?: string })?.error?.message ??
                  (raw as { message?: string })?.message ??
                  "AI upstream hatası.";
            console.warn(`[api/chat][${requestId}] upstream ${upstream.status}: ${errMsg}`);
            if (upstream.status === 429) {
              return chatJson({ ok: false, error: "AI limiti doldu, biraz bekleyin." }, 429, requestId);
            }
            if (upstream.status === 402) {
              return chatJson({ ok: false, error: "AI kredisi tükendi." }, 402, requestId);
            }
            return chatJson({ ok: false, error: errMsg }, 502, requestId);
          }

          const answer =
            (raw as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
              ?.content ?? "";

          return chatJson({ ok: true, response: answer, model }, 200, requestId);
        } catch (e) {
          console.error(`[api/chat][${requestId}] fetch failed:`, (e as Error).message);
          return chatJson({ ok: false, error: (e as Error).message }, 502, requestId);
        }
      },
    },
  },
});
