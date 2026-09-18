import { createFileRoute } from "@tanstack/react-router";
import { issueLicenseToken } from "@/lib/license-token";
import {
  CORS,
  json,
  signPayload,
  clientIp,
} from "@/lib/license-api.server";
import { mysqlQuery, mysqlOne } from "@/lib/mysql.server";

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid() {
  return crypto.randomUUID();
}

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

async function guardReplayMysql(license_key: string, tsVal: unknown, nonce: unknown): Promise<Response | null> {
  const tsNum = Number(tsVal);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > REPLAY_WINDOW_MS) {
    return json({ valid: false, error: "Geçersiz istek." }, 400);
  }
  const n = (nonce ?? "").toString().trim();
  if (!n || n.length < 6 || n.length > 128) {
    return json({ valid: false, error: "Geçersiz istek." }, 400);
  }
  const dup = await mysqlOne<{ id: string }>("SELECT id FROM license_nonces WHERE nonce=?", [n]);
  if (dup) {
    return json({ valid: false, error: "Geçersiz istek." }, 409);
  }
  try {
    await mysqlQuery("INSERT INTO license_nonces (id,nonce,license_key,created_at) VALUES (?,?,?,?)", [
      uid(), n, license_key, ts(),
    ]);
  } catch (e) {
    console.error("[license-api] nonce insert failed", (e as Error).message);
  }
  return null;
}

async function logEventMysql(entry: {
  license_key: string;
  event: "activate" | "validate" | "revoke" | "fail" | "admin_create" | "admin_revoke" | "unlock" | "tampering";
  hwid?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await mysqlQuery(
      "INSERT INTO license_events (id,license_key,event,hwid,ip,user_agent,detail,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [uid(), entry.license_key, entry.event, entry.hwid ?? null, entry.ip ?? null, entry.user_agent ?? null, entry.detail ?? null, ts()],
    );
  } catch (e) {
    console.error("[license-api] event log failed", (e as Error).message);
  }
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

export const Route = createFileRoute("/api/validate")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: { license_key?: string; hwid?: string; _ts?: number; _nonce?: string };
        try {
          payload = await request.json();
        } catch {
          return json({ valid: false, error: "Geçersiz JSON." }, 400);
        }
        const license_key = (payload?.license_key ?? "").toString().trim().toUpperCase();
        const hwid = (payload?.hwid ?? "").toString().trim();
        if (!license_key || !hwid) {
          return json({ valid: false, error: "license_key ve hwid gerekli." }, 400);
        }

        const ip = clientIp(request);
        const ua = request.headers.get("user-agent") ?? "";

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
          return json({ valid: false, error: msg }, 500);
        }

        const result: {
          valid: boolean;
          error?: string;
          minutes_left?: number | null;
          days_left?: number | null;
          expires_at?: string | null;
          owner_email?: string | null;
          owner_name?: string | null;
          payload?: string;
          token?: string;
          token_expires?: number;
          hmac?: string;
        } = { valid: false };

        if (!row) {
          result.error = "Lisans bulunamadı.";
        } else if (row.revoked) {
          result.error = "Lisans iptal edildi.";
        } else {
          let effective = row;
          if (!row.hwid) {
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
          } else if (row.hwid !== hwid) {
            result.error = "Bu lisans başka bir cihaza kilitli.";
            effective = row;
          } else {
            await mysqlQuery("UPDATE license_keys SET last_validated_at=? WHERE id=?", [ts(), row.id]);
          }

          if (!result.error) {
            if (effective.expires_at && new Date(effective.expires_at).getTime() < Date.now()) {
              result.error = "Lisans süreniz doldu.";
            } else {
              let ownerEmailMasked: string | null = null;
              let ownerName: string | null = null;
              if (effective.assigned_order_id) {
                const owner = await mysqlOne<{ email: string | null; display_name: string | null }>(
                  `SELECT p.email, p.display_name FROM orders o JOIN profiles p ON p.id=o.user_id WHERE o.id=?`,
                  [effective.assigned_order_id],
                );
                if (owner?.email) {
                  ownerEmailMasked = owner.email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2");
                }
                ownerName = owner?.display_name ?? null;
              }
              result.valid = true;
              if (effective.expires_at) {
                const secsLeft = Math.max(0, Math.floor((new Date(effective.expires_at).getTime() - Date.now()) / 1000));
                result.minutes_left = Math.floor(secsLeft / 60);
                result.days_left = Math.floor(secsLeft / 86400);
              } else {
                result.minutes_left = null;
                result.days_left = null;
              }
              result.expires_at = effective.expires_at ?? null;
              result.owner_email = ownerEmailMasked;
              result.owner_name = ownerName;
            }
          }
        }

        if (result.valid) {
          result.payload = "eFNpYmVyUEhQeA==";
          try {
            const { token, token_expires } = issueLicenseToken(hwid, license_key);
            result.token = token;
            result.token_expires = token_expires;
          } catch (e) {
            console.error("[api/validate] token sign failed", e instanceof Error ? e.message : e);
          }
          try {
            result.hmac = signPayload({
              key: license_key,
              hwid,
              status: "active",
              days_left: result.days_left ?? null,
              expires_at: result.expires_at ?? null,
            });
          } catch (e) {
            console.error("[api/validate] hmac sign failed", (e as Error).message);
          }
          await logEventMysql({
            license_key, event: "validate", hwid, ip, user_agent: ua,
            detail: `days_left=${result.days_left ?? ""}`,
          });
        } else {
          await logEventMysql({
            license_key, event: "fail", hwid, ip, user_agent: ua,
            detail: result.error ?? "invalid",
          });
        }
        return json(result);
      },
    },
  },
});
