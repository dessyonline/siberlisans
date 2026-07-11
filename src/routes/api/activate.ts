import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { issueLicenseToken } from "@/lib/license-token";
import {
  CORS,
  json,
  signPayload,
  guardReplay,
  logEvent,
  clientIp,
} from "@/lib/license-api.server";

export const Route = createFileRoute("/api/activate")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: { license_key?: string; hwid?: string; _ts?: number; _nonce?: string };
        try {
          payload = await request.json();
        } catch {
          return json({ success: false, error: "Geçersiz JSON." }, 400);
        }
        const license_key = (payload?.license_key ?? "").toString().trim().toUpperCase();
        const hwid = (payload?.hwid ?? "").toString().trim();
        if (!license_key || !hwid) {
          return json({ success: false, error: "license_key ve hwid gerekli." }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const ip = clientIp(request);
        const ua = request.headers.get("user-agent") ?? "";

        // _ts / _nonce zorunlu değil (geriye uyumluluk) ama gönderildiyse doğrula
        if (payload._ts !== undefined || payload._nonce !== undefined) {
          const bad = await guardReplay(supabaseAdmin as never, license_key, payload._ts, payload._nonce);
          if (bad) {
            await logEvent(supabaseAdmin as never, {
              license_key, event: "fail", hwid, ip, user_agent: ua, detail: "replay",
            });
            return bad;
          }
        }

        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
        );

        const { data, error } = await supabase.rpc("activate_license", {
          _key: license_key,
          _hwid: hwid,
        });
        if (error) {
          await logEvent(supabaseAdmin as never, {
            license_key, event: "fail", hwid, ip, user_agent: ua, detail: error.message,
          });
          return json({ success: false, error: error.message }, 500);
        }
        const result = (data ?? { success: false, error: "Bilinmeyen hata." }) as Record<string, unknown>;
        if (result.success) {
          result.payload = "eFNpYmVyUEhQeA==";
          try {
            const { token, token_expires } = issueLicenseToken(hwid, license_key);
            result.token = token;
            result.token_expires = token_expires;
          } catch (e) {
            console.error("[api/activate] token sign failed", e instanceof Error ? e.message : e);
          }
          // HMAC imzası: istemci offline doğrulamada kullanır
          try {
            result.hmac = signPayload({
              key: license_key,
              hwid,
              status: result.status ?? "active",
              days_left: result.days_left ?? null,
              expires_at: result.expires_at ?? null,
            });
          } catch (e) {
            console.error("[api/activate] hmac sign failed", (e as Error).message);
          }
          await logEvent(supabaseAdmin as never, {
            license_key, event: "activate", hwid, ip, user_agent: ua,
            detail: `days_left=${result.days_left ?? ""}`,
          });
          // Yeni HWID kaydı — admin'e "kim aktive etti" bildirimi
          try {
            const { data: prev } = await (supabaseAdmin as unknown as {
              from: (t: string) => { select: (c: string) => { eq: (a: string, b: string) => { eq: (a: string, b: string) => { limit: (n: number) => Promise<{ data: Array<{ id: string }> | null }> } } } };
            })
              .from("license_events")
              .select("id")
              .eq("license_key", license_key)
              .eq("event", "activate")
              .limit(2);
            const firstTime = !prev || prev.length <= 1;
            if (firstTime) {
              const { notifyTelegram } = await import("@/lib/telegram.server");
              const owner = (result.owner_email as string | undefined) ?? "—";
              const name = (result.owner_name as string | undefined) ?? "";
              const exp = result.expires_at ? new Date(result.expires_at as string).toLocaleString("tr-TR") : "süresiz";
              await notifyTelegram(
                `🔑 <b>Lisans aktive edildi</b>\n` +
                `<code>${license_key}</code>\n` +
                `👤 ${name ? name + " · " : ""}${owner}\n` +
                `🖥 HWID: <code>${hwid.slice(0, 8)}…${hwid.slice(-8)}</code>\n` +
                `⏰ Bitiş: ${exp}\n` +
                `🌐 ${ip || "—"}`,
              );
            }
          } catch (e) {
            console.error("[api/activate] telegram notify failed", (e as Error).message);
          }
        } else {
          await logEvent(supabaseAdmin as never, {
            license_key, event: "fail", hwid, ip, user_agent: ua,
            detail: (result.error as string) ?? "activate_failed",
          });
        }
        return json(result);
      },
    },
  },
});
