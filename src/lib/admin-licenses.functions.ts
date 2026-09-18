import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-middleware.server";
import { mysqlQuery, mysqlOne, bool } from "@/lib/mysql.server";

const LOVABLE_PRODUCT_ID = "4f6d86cf-6a89-4940-90af-953cc3d6ab5f";

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export type AdminLicenseRow = {
  id: string;
  key_value: string;
  status: string;
  hwid: string | null;
  activated_at: string | null;
  expires_at: string | null;
  duration_days: number | null;
  duration_minutes: number | null;
  revoked: boolean;
  last_validated_at: string | null;
  product: { name: string; slug: string } | null;
};

export const listLovableLicenses = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<AdminLicenseRow[]> => {
    const rows = await mysqlQuery<Record<string, unknown>>(
      `SELECT lk.id, lk.key_value, lk.status, lk.hwid, lk.activated_at, lk.expires_at,
              lk.duration_days, lk.duration_minutes, lk.revoked, lk.last_validated_at,
              p.name product_name, p.slug product_slug
         FROM license_keys lk
         LEFT JOIN products p ON p.id = lk.product_id
        WHERE lk.product_id = ?
        ORDER BY lk.created_at DESC
        LIMIT 500`,
      [LOVABLE_PRODUCT_ID],
    );
    return rows.map((r) => ({
      id: String(r.id),
      key_value: String(r.key_value),
      status: String(r.status),
      hwid: (r.hwid as string | null) ?? null,
      activated_at: (r.activated_at as string | null) ?? null,
      expires_at: (r.expires_at as string | null) ?? null,
      duration_days: r.duration_days === null || r.duration_days === undefined ? null : Number(r.duration_days),
      duration_minutes: r.duration_minutes === null || r.duration_minutes === undefined ? null : Number(r.duration_minutes),
      revoked: bool(r.revoked),
      last_validated_at: (r.last_validated_at as string | null) ?? null,
      product: r.product_name ? { name: String(r.product_name), slug: String(r.product_slug) } : null,
    }));
  });

const generateInput = z.object({
  qty: z.number().int().min(1).max(200),
  minutes: z.number().int().positive().nullable(),
});

function genKey(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n: number) => Array.from({ length: n }, () => abc[Math.floor(Math.random() * abc.length)]).join("");
  return `SIBER-${seg(4)}-${seg(4)}-${seg(4)}`;
}

export const generateLovableLicenses = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => generateInput.parse(d))
  .handler(async ({ data }) => {
    const keys = Array.from({ length: data.qty }, () => genKey());
    for (const k of keys) {
      const durationDays = data.minutes ? Math.max(1, Math.round(data.minutes / 1440)) : null;
      await mysqlQuery(
        `INSERT INTO license_keys (id,product_id,key_value,duration_minutes,duration_days,status,created_at)
         VALUES (?,?,?,?,?, 'available', ?)`,
        [crypto.randomUUID(), LOVABLE_PRODUCT_ID, k, data.minutes, durationDays, ts()],
      );
    }
    return { keys };
  });

const actionInput = z.object({
  id: z.string().uuid(),
  action: z.enum(["reset_hwid", "set_duration", "revoke", "unrevoke"]),
  valueInt: z.number().int().nullable().optional(),
});

export const setLicenseAction = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => actionInput.parse(d))
  .handler(async ({ data }) => {
    if (data.action === "reset_hwid") {
      await mysqlQuery("UPDATE license_keys SET hwid=NULL WHERE id=?", [data.id]);
    } else if (data.action === "revoke") {
      await mysqlQuery("UPDATE license_keys SET revoked=1 WHERE id=?", [data.id]);
    } else if (data.action === "unrevoke") {
      await mysqlQuery("UPDATE license_keys SET revoked=0 WHERE id=?", [data.id]);
    } else if (data.action === "set_duration") {
      const days = data.valueInt ?? null;
      const minutes = days === null ? null : days * 1440;
      const row = await mysqlOne<{ activated_at: string | null }>(
        "SELECT activated_at FROM license_keys WHERE id=?",
        [data.id],
      );
      let expiresAt: string | null = null;
      if (row?.activated_at && days !== null) {
        expiresAt = new Date(new Date(row.activated_at).getTime() + days * 86400000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
      }
      await mysqlQuery(
        "UPDATE license_keys SET duration_days=?, duration_minutes=?, expires_at=? WHERE id=?",
        [days, minutes, expiresAt, data.id],
      );
    }
    return { ok: true };
  });

export const deleteLicense = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await mysqlQuery("UPDATE orders SET license_key_id=NULL WHERE license_key_id=?", [data.id]).catch(() => undefined);
    await mysqlQuery("DELETE FROM license_keys WHERE id=?", [data.id]);
    return { ok: true };
  });

export const purgeUnusedLovableLicenses = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const before = await mysqlQuery<{ id: string }>(
      "SELECT id FROM license_keys WHERE product_id=? AND status='available' AND hwid IS NULL",
      [LOVABLE_PRODUCT_ID],
    );
    await mysqlQuery(
      "DELETE FROM license_keys WHERE product_id=? AND status='available' AND hwid IS NULL",
      [LOVABLE_PRODUCT_ID],
    );
    return { deleted: before.length };
  });
