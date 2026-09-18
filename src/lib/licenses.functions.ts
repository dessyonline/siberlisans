import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, bool } from "@/lib/mysql.server";
import { logEventMysql, ts } from "@/lib/license-mysql.server";

export type MyLicense = {
  id: string;
  key_value: string;
  status: string;
  hwid: string | null;
  activated_at: string | null;
  assigned_at: string | null;
  expires_at: string | null;
  duration_days: number | null;
  duration_minutes: number | null;
  last_validated_at: string | null;
  revoked: boolean;
  activation_token: string | null;
  order_id: string | null;
  order_reference: string | null;
  product: { id: string; name: string; slug: string; delivery_type: string } | null;
};

/**
 * Kullanıcının satın aldığı lisans anahtarlarını (order_keys üzerinden) döndürür.
 */
export const listMyLicenses = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const rows = await mysqlQuery<{
      order_id: string;
      reference_code: string;
      id: string;
      key_value: string;
      status: string;
      hwid: string | null;
      activated_at: string | null;
      assigned_at: string | null;
      expires_at: string | null;
      duration_days: number | null;
      duration_minutes: number | null;
      last_validated_at: string | null;
      revoked: number | null;
      activation_token: string | null;
      product_id: string | null;
      product_name: string | null;
      product_slug: string | null;
      delivery_type: string | null;
    }>(
      `SELECT o.id order_id, o.reference_code,
              lk.id, lk.key_value, lk.status, lk.hwid, lk.activated_at, lk.assigned_at, lk.expires_at,
              lk.duration_days, lk.duration_minutes, lk.last_validated_at, lk.revoked, lk.activation_token,
              p.id product_id, p.name product_name, p.slug product_slug, p.delivery_type
         FROM orders o
         JOIN order_keys ok ON ok.order_id = o.id
         JOIN license_keys lk ON lk.id = ok.license_key_id
         LEFT JOIN products p ON p.id = lk.product_id
        WHERE o.user_id = ? AND o.status = 'approved'
        ORDER BY lk.assigned_at DESC`,
      [context.userId],
    );

    return rows.map<MyLicense>((r) => ({
      id: r.id,
      key_value: r.key_value,
      status: r.status,
      hwid: r.hwid,
      activated_at: r.activated_at,
      assigned_at: r.assigned_at,
      expires_at: r.expires_at,
      duration_days: r.duration_days,
      duration_minutes: r.duration_minutes,
      last_validated_at: r.last_validated_at,
      revoked: bool(r.revoked),
      activation_token: r.activation_token,
      order_id: r.order_id,
      order_reference: r.reference_code,
      product: r.product_id
        ? { id: r.product_id, name: r.product_name ?? "", slug: r.product_slug ?? "", delivery_type: r.delivery_type ?? "key" }
        : null,
    }));
  });

/**
 * Kullanıcı kendi lisansındaki HWID'yi sıfırlar. Yalnızca sahibi çağırabilir.
 * 24 saatte 1 defa kullanılabilir (spam koruması).
 */
export const releaseMyHwid = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input) => z.object({ license_key_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const row = await mysqlOne<{ key_value: string; user_id: string }>(
      `SELECT lk.key_value, o.user_id
         FROM order_keys ok
         JOIN license_keys lk ON lk.id = ok.license_key_id
         JOIN orders o ON o.id = ok.order_id
        WHERE ok.license_key_id = ?
        LIMIT 1`,
      [data.license_key_id],
    );
    if (!row || row.user_id !== context.userId) {
      throw new Error("Bu lisans size ait değil.");
    }

    const last = await mysqlOne<{ created_at: string }>(
      `SELECT created_at FROM license_events
        WHERE license_key = ? AND event = 'hwid_reset'
        ORDER BY created_at DESC LIMIT 1`,
      [row.key_value],
    );
    if (last?.created_at) {
      const diff = Date.now() - new Date(last.created_at).getTime();
      if (diff < 24 * 3600 * 1000) {
        const hoursLeft = Math.ceil((24 * 3600 * 1000 - diff) / 3600000);
        throw new Error(`HWID sıfırlama 24 saatte bir yapılabilir. ${hoursLeft} saat sonra tekrar deneyin.`);
      }
    }

    await mysqlQuery("UPDATE license_keys SET hwid=NULL, activated_at=NULL WHERE id=?", [data.license_key_id]);
    await logEventMysql({ license_key: row.key_value, event: "hwid_reset", detail: "user_self_reset" });

    return { ok: true };
  });
