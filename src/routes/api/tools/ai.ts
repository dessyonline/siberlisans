import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// POST /api/tools/ai
// Body: { tool: "chat"|"translate"|"code"|"summary"|"slogan", input: string, sourceLang?, targetLang? }
// Kullanıcı token'ı ile RLS altında consume_ai_quota RPC'sini çağırır, ardından Lovable AI Gateway'e proxy'ler.

type ToolKey = "chat" | "translate" | "code" | "summary" | "slogan";

const SYSTEM_PROMPTS: Record<ToolKey, string> = {
  chat:
    "Sen yardımsever, kısa ve net Türkçe konuşan bir asistansın. Kod önerilerini markdown ile ver.",
  translate:
    "Sen profesyonel bir çevirmensin. Kullanıcının verdiği metni istenen dile çevir. Sadece çeviriyi ver, açıklama ekleme.",
  code:
    "Sen deneyimli bir yazılım geliştiricisisin. Verilen kodu Türkçe olarak satır satır açıkla, sonra 3-5 madde ile iyileştirme öner. Kısa tut, markdown kullan.",
  summary:
    "Sen bir metin özetleyicisin. Verilen uzun metni maksimum 6 madde halinde Türkçe özetle. Fazla dolgu kullanma.",
  slogan:
    "Sen yaratıcı bir marka copywriter'ısın. Verilen ürün/hizmet için 5 farklı, akılda kalıcı Türkçe slogan öner. Numaralı liste kullan.",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

export const Route = createFileRoute("/api/tools/ai")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token) return json({ ok: false, error: "not_authenticated" }, 401);

        let body: {
          tool?: ToolKey;
          input?: string;
          sourceLang?: string;
          targetLang?: string;
        };
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }
        const tool = body.tool;
        const input = (body.input ?? "").toString().trim();
        if (!tool || !(tool in SYSTEM_PROMPTS)) return json({ ok: false, error: "invalid_tool" }, 400);
        if (input.length < 1) return json({ ok: false, error: "empty_input" }, 400);
        if (input.length > 8000) return json({ ok: false, error: "input_too_long" }, 400);

        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!url || !key || !apiKey) return json({ ok: false, error: "server_misconfigured" }, 500);

        const supabase = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Kota tüket (RLS + auth.uid() ile SECURITY DEFINER içinden)
        const { data: quota, error: quotaErr } = await supabase.rpc("consume_ai_quota", {
          _tool_key: tool,
        });
        if (quotaErr) {
          const msg = quotaErr.message ?? "";
          if (msg.includes("quota_exhausted")) {
            return json({ ok: false, error: "quota_exhausted" }, 429);
          }
          if (msg.includes("not_authenticated")) {
            return json({ ok: false, error: "not_authenticated" }, 401);
          }
          return json({ ok: false, error: msg || "quota_error" }, 500);
        }

        const userMessage =
          tool === "translate"
            ? `Kaynak dil: ${body.sourceLang ?? "auto"}\nHedef dil: ${body.targetLang ?? "Türkçe"}\n\nMetin:\n${input}`
            : input;

        try {
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: SYSTEM_PROMPTS[tool] },
                { role: "user", content: userMessage },
              ],
              temperature: tool === "translate" ? 0.2 : 0.7,
            }),
          });
          const raw = await upstream.json().catch(() => ({}));
          if (!upstream.ok) {
            const errMsg =
              (raw as { error?: { message?: string } })?.error?.message ?? "AI upstream hatası.";
            if (upstream.status === 429) return json({ ok: false, error: "ai_rate_limited" }, 429);
            if (upstream.status === 402) return json({ ok: false, error: "ai_credits_exhausted" }, 402);
            return json({ ok: false, error: errMsg }, 502);
          }
          const answer =
            (raw as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
              ?.content ?? "";
          return json({ ok: true, response: answer, quota });
        } catch (e) {
          return json({ ok: false, error: (e as Error).message }, 502);
        }
      },
    },
  },
});
