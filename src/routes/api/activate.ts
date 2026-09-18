import { createFileRoute } from "@tanstack/react-router";
import { issueLicenseToken } from "@/lib/license-token";
import {
  CORS,
  json,
  signPayload,
  clientIp,
} from "@/lib/license-api.server";
import { guardReplayMysql, logEventMysql } from "@/lib/license-mysql.server";
import { mysqlOne, mysqlQuery } from "@/lib/mysql.server";

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
  assigned_order_id: string | null;
};

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

        const ip = clientIp(request);
        const ua = request.headers.get("user-agent") ?? "";

        // _ts / _nonce zorunlu değil (geriye uyumluluk) ama gönderildiyse doğrula
        if (payload._ts !== undefined || payload._nonce !== undefined) {
          const bad = await guardReplayMysql(license_key, payload._ts, payload._nonce);
          if (bad) {
            await logEventMysql({ license_key, event: "fail", hwid, ip, user_agent: ua, detail: "replay" });
            return bad;
          }
        }

        let row: LicenseKeyRow | null;
        try {
          row = await mysqlOne<LicenseKeyRow>(
            `SELECT id, product_id, key_value, hwid, revoked, activated_at, expires_at, duration_minutes, duration_days, assigned_order_id
               FROM license_keys WHERE UPPER(key_value)=?`,
            [license_key],
          );
        } catch (e) {
          const msg = (e as Error).message;
          await logEventMysql({ license_key, event: "fail", hwid, ip, user_agent: ua, detail: msg });
          return json({ success: false, error: msg }, 500);
        }

        const result: Record<string, unknown> = { success: false };
        let firstTimeActivation = false;
        let ownerEmail: string | null = null;
        let ownerName: string | null = null;

        if (!row) {
          result.error = "Lisans anahtarı bulunamadı.";
        } else if (row.revoked) {
          result.error = "Bu lisans iptal edilmiş.";
        } else if (row.hwid && row.hwid !== hwid) {
          result.error = "Bu lisans anahtarı zaten başka bir cihazda kullanılıyor.";
        } else {
          let effective = row;
          if (!row.hwid) {
            firstTimeActivation = true;
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
              "UPDATE license_keys SET hwid=?, activated_at=COALESCE(activated_at,?), expires_at=?, duration_minutes=COALESCE(duration_minutes,?), last_validated_at=? WHERE id=?",
              [hwid, ts(), newExpires, minutes, ts(), row.id],
            );
            effective = { ...row, hwid, expires_at: newExpires, duration_minutes: minutes ?? row.duration_minutes };
          } else {
            await mysqlQuery("UPDATE license_keys SET last_validated_at=? WHERE id=?", [ts(), row.id]);
          }

          if (effective.expires_at && new Date(effective.expires_at).getTime() < Date.now()) {
            result.error = "Lisans süreniz doldu.";
          } else {
            if (effective.assigned_order_id) {
              const owner = await mysqlOne<{ email: string | null; display_name: string | null }>(
                `SELECT p.email, p.display_name FROM orders o JOIN profiles p ON p.id=o.user_id WHERE o.id=?`,
                [effective.assigned_order_id],
              );
              ownerEmail = owner?.email ?? null;
              ownerName = owner?.display_name ?? null;
            }
            result.success = true;
            if (effective.expires_at) {
              const secsLeft = Math.max(0, Math.floor((new Date(effective.expires_at).getTime() - Date.now()) / 1000));
              result.minutes_left = Math.floor(secsLeft / 60);
              result.days_left = Math.floor(secsLeft / 86400);
            } else {
              result.minutes_left = null;
              result.days_left = null;
            }
            result.expires_at = effective.expires_at ?? null;
            result.owner_email = ownerEmail;
            result.owner_name = ownerName;
          }
        }

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
              status: "active",
              days_left: result.days_left ?? null,
              expires_at: result.expires_at ?? null,
            });
          } catch (e) {
            console.error("[api/activate] hmac sign failed", (e as Error).message);
          }
          await logEventMysql({
            license_key, event: "activate", hwid, ip, user_agent: ua,
            detail: `days_left=${result.days_left ?? ""}`,
          });
          // Yeni HWID kaydı — admin'e "kim aktive etti" bildirimi
          try {
            if (firstTimeActivation) {
              const { notifyTelegram } = await import("@/lib/telegram.server");
              const owner = ownerEmail ?? "—";
              const name = ownerName ?? "";
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
          await logEventMysql({
            license_key, event: "fail", hwid, ip, user_agent: ua,
            detail: (result.error as string) ?? "activate_failed",
          });
        }
        return json(result);
      },
    },
  },
});
