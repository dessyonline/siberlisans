import { createFileRoute } from "@tanstack/react-router";
import {
  CORS,
  clientIp,
  json,
} from "@/lib/license-api.server";
import { logEventMysql } from "@/lib/license-mysql-log.server";
import { mysqlQuery } from "@/lib/mysql.server";

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export const Route = createFileRoute("/api/tampering-report")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: {
          license_key?: string;
          hwid?: string;
          reason?: string;
          detail?: string;
        };
        try {
          payload = await request.json();
        } catch {
          return json({ ok: false, error: "Geçersiz JSON." }, 400);
        }

        const license_key = (payload?.license_key ?? "").toString().trim().toUpperCase();
        const hwid = (payload?.hwid ?? "").toString().trim();
        const reason = (payload?.reason ?? "unknown").toString().slice(0, 64);
        const extra = (payload?.detail ?? "").toString().slice(0, 512);

        if (!license_key) {
          return json({ ok: false, error: "license_key gerekli." }, 400);
        }

        const ip = clientIp(request);
        const ua = request.headers.get("user-agent") ?? "";

        // Log the report
        await logEventMysql({
          license_key,
          event: "tampering",
          hwid: hwid || null,
          ip,
          user_agent: ua,
          detail: reason + (extra ? " | " + extra : ""),
        });

        // Kritik reason'larda lisansı otomatik iptal et
        const autoRevoke = [
          "hmac_mismatch",
          "debugger_detected",
          "integrity_fail",
          "code_patched",
          "honeypot_triggered",
        ].includes(reason);

        if (autoRevoke) {
          try {
            await mysqlQuery(
              "UPDATE license_keys SET revoked=1, revoked_at=? WHERE UPPER(key_value)=?",
              [ts(), license_key],
            );

            await logEventMysql({
              license_key,
              event: "revoke",
              hwid: hwid || null,
              ip,
              user_agent: ua,
              detail: "auto_revoke:tampering:" + reason,
            });

            // Telegram bildirimi
            try {
              const { notifyTelegram } = await import("@/lib/telegram.server");
              await notifyTelegram(
                `🚨 *Tampering Tespit Edildi*\n\n` +
                  `Lisans: \`${license_key}\`\n` +
                  `Sebep: \`${reason}\`\n` +
                  `HWID: \`${hwid.slice(0, 12)}...\`\n` +
                  `IP: \`${ip}\`\n\n` +
                  `Lisans otomatik iptal edildi.`,
              );
            } catch {
              // notify hatası kritik değil
            }
          } catch (e) {
            console.error("[api/tampering-report] auto-revoke failed", e);
          }
        }

        // Client'a sessiz cevap — ne olduğunu bildirme
        return json({ ok: true, received: true }, 200);
      },
    },
  },
});
