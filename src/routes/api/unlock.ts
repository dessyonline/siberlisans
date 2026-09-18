import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "crypto";
import {
  CORS,
  clientIp,
  deriveUnlockKey,
  json,
  signPayload,
} from "@/lib/license-api.server";
import { guardReplayMysql, logEventMysql } from "@/lib/license-mysql-log.server";
import { mysqlOne, mysqlQuery } from "@/lib/mysql.server";

const UNLOCK_TTL_SECONDS = 1800; // 30 dk

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

type LicenseKeyRow = {
  id: string;
  product_id: string | null;
  key_value: string;
  hwid: string | null;
  revoked: number | null;
  activated_at: string | null;
  expires_at: string | null;
  duration_minutes: number | null;
  duration_days: number | null;
};

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

        const ip = clientIp(request);
        const ua = request.headers.get("user-agent") ?? "";

        // Replay/nonce zorunlu — unlock kritik endpoint
        const bad = await guardReplayMysql(license_key, payload._ts, payload._nonce);
        if (bad) {
          await logEventMysql({ license_key, event: "fail", hwid, ip, user_agent: ua, detail: "unlock_replay" });
          return bad;
        }

        let row: LicenseKeyRow | null;
        try {
          row = await mysqlOne<LicenseKeyRow>(
            `SELECT id, product_id, key_value, hwid, revoked, activated_at, expires_at, duration_minutes, duration_days
               FROM license_keys WHERE UPPER(key_value)=?`,
            [license_key],
          );
        } catch (e) {
          const msg = (e as Error).message;
          await logEventMysql({ license_key, event: "fail", hwid, ip, user_agent: ua, detail: "unlock_rpc:" + msg });
          return json({ ok: false, error: "Doğrulama başarısız." }, 500);
        }

        let error: string | null = null;
        let effective = row;
        if (!row) {
          error = "Lisans anahtarı bulunamadı.";
        } else if (row.revoked) {
          error = "Bu lisans iptal edilmiş.";
        } else if (row.hwid && row.hwid !== hwid) {
          error = "Bu lisans anahtarı zaten başka bir cihazda kullanılıyor.";
        } else if (!row.hwid) {
          let minutes = row.duration_minutes;
          if (minutes == null && row.duration_days != null) minutes = row.duration_days * 1440;
          if (minutes == null && row.product_id) {
            const prod = await mysqlOne<{ default_license_days: number | null }>(
              "SELECT default_license_days FROM products WHERE id=?",
              [row.product_id],
            );
            if (prod?.default_license_days != null) minutes = prod.default_license_days * 1440;
          }
          const newExpires = row.expires_at
            ? row.expires_at
            : minutes != null
              ? ts(new Date(Date.now() + minutes * 60_000))
              : null;
          await mysqlQuery(
            "UPDATE license_keys SET hwid=?, activated_at=COALESCE(activated_at,?), expires_at=?, duration_minutes=COALESCE(duration_minutes,?) WHERE id=?",
            [hwid, ts(), newExpires, minutes, row.id],
          );
          effective = { ...row, hwid, expires_at: newExpires, duration_minutes: minutes ?? row.duration_minutes };
        }

        if (error) {
          await logEventMysql({ license_key, event: "fail", hwid, ip, user_agent: ua, detail: "unlock_denied:" + error });
          const code = error.toLowerCase();
          const status = code.includes("hwid") || code.includes("cihaz")
            ? 403
            : code.includes("süre") || code.includes("iptal")
              ? 401
              : 400;
          return json({ ok: false, error }, status);
        }

        let daysLeft: number | null = null;
        if (effective?.expires_at) {
          if (new Date(effective.expires_at).getTime() < Date.now()) {
            await logEventMysql({ license_key, event: "fail", hwid, ip, user_agent: ua, detail: "unlock_denied:expired" });
            return json({ ok: false, error: "Lisans süreniz doldu." }, 401);
          }
          daysLeft = Math.floor((new Date(effective.expires_at).getTime() - Date.now()) / 86400000);
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
          days_left: daysLeft,
          license_expires_at: effective?.expires_at ?? null,
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

        await logEventMysql({
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
