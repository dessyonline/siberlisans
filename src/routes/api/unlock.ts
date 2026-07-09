import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import type { Database } from "@/integrations/supabase/types";
import {
  CORS,
  clientIp,
  deriveUnlockKey,
  guardReplay,
  json,
  logEvent,
  signPayload,
} from "@/lib/license-api.server";

const UNLOCK_TTL_SECONDS = 1800; // 30 dk

export const Route = createFileRoute("/api/unlock")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: { license_key?: string; hwid?: string; _ts?: number; _nonce?: string };
        try {
          payload = await request.json();
        } catch {
          return json({ ok: false, error: "Geçersiz JSON." }, 400);
        }

        const license_key = (payload?.license_key ?? "").toString().trim().toUpperCase();
        const hwid = (payload?.hwid ?? "").toString().trim();
        if (!license_key || !hwid) {
          return json({ ok: false, error: "license_key ve hwid gerekli." }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const ip = clientIp(request);
        const ua = request.headers.get("user-agent") ?? "";

        // Replay/nonce zorunlu — unlock kritik endpoint
        const bad = await guardReplay(
          supabaseAdmin as never,
          license_key,
          payload._ts,
          payload._nonce,
        );
        if (bad) {
          await logEvent(supabaseAdmin as never, {
            license_key,
            event: "fail",
            hwid,
            ip,
            user_agent: ua,
            detail: "unlock_replay",
          });
          return bad;
        }

        // Lisans doğrulaması — activate_license idempotenttir:
        // aynı HWID ise success; mismatch/expired/revoked ise error döner.
        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              storage: undefined,
            },
          },
        );

        const { data, error } = await supabase.rpc("activate_license", {
          _key: license_key,
          _hwid: hwid,
        });

        if (error) {
          await logEvent(supabaseAdmin as never, {
            license_key,
            event: "fail",
            hwid,
            ip,
            user_agent: ua,
            detail: "unlock_rpc:" + error.message,
          });
          return json({ ok: false, error: "Doğrulama başarısız." }, 500);
        }

        const result = (data ?? {}) as Record<string, unknown>;
        if (!result.success) {
          await logEvent(supabaseAdmin as never, {
            license_key,
            event: "fail",
            hwid,
            ip,
            user_agent: ua,
            detail: "unlock_denied:" + String(result.error ?? "unknown"),
          });
          const code = String(result.error ?? "").toLowerCase();
          const status = code.includes("hwid")
            ? 403
            : code.includes("expired") || code.includes("revoked")
              ? 401
              : 400;
          return json({ ok: false, error: result.error ?? "Doğrulama başarısız." }, status);
        }

        // Deterministic unlock key + session
        const unlock_key = deriveUnlockKey(license_key, hwid);
        const session_id = randomUUID();
        const issued_at = Math.floor(Date.now() / 1000);
        const expires_at = issued_at + UNLOCK_TTL_SECONDS;

        const body: Record<string, unknown> = {
          ok: true,
          unlock_key,
          session_id,
          issued_at,
          expires_at,
          expires_in: UNLOCK_TTL_SECONDS,
          days_left: result.days_left ?? null,
          license_expires_at: result.expires_at ?? null,
        };

        try {
          body.hmac = signPayload({
            key: license_key,
            hwid,
            session_id,
            expires_at,
            days_left: body.days_left,
          });
        } catch (e) {
          console.error("[api/unlock] hmac sign failed", e instanceof Error ? e.message : e);
          return json({ ok: false, error: "Sunucu yapılandırma hatası." }, 500);
        }

        await logEvent(supabaseAdmin as never, {
          license_key,
          event: "unlock",
          hwid,
          ip,
          user_agent: ua,
          detail: "session:" + session_id + " days_left:" + String(body.days_left),
        });

        return json(body, 200);
      },
    },
  },
});
