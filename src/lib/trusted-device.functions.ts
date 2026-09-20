import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestIP } from "@tanstack/react-start/server";
import { requireAuth } from "@/lib/auth-middleware.server";
import { mysqlQuery } from "@/lib/mysql.server";

async function ensureTable() {
  await mysqlQuery(`CREATE TABLE IF NOT EXISTS user_trusted_devices (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    label VARCHAR(120) NULL,
    last_ip VARCHAR(64) NULL,
    trusted_until DATETIME NULL,
    last_seen_at DATETIME NOT NULL,
    UNIQUE KEY uniq_user_device (user_id, device_id)
  )`);
}

function mysqlDate(d: Date) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export const trustCurrentDevice = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ deviceId: z.string().min(4).max(128), label: z.string().max(120).optional(), days: z.number().min(1).max(365).default(30) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await ensureTable();
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const now = new Date();
    const until = mysqlDate(new Date(now.getTime() + data.days * 86400000));
    await mysqlQuery(
      `INSERT INTO user_trusted_devices (id, user_id, device_id, label, last_ip, trusted_until, last_seen_at)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE label=COALESCE(VALUES(label), label), last_ip=COALESCE(VALUES(last_ip), last_ip),
         trusted_until=VALUES(trusted_until), last_seen_at=VALUES(last_seen_at)`,
      [crypto.randomUUID(), context.userId, data.deviceId, data.label ?? null, ip, until, mysqlDate(now)],
    );
    const rows = await mysqlQuery<{ id: string }>(
      "SELECT id FROM user_trusted_devices WHERE user_id=? ORDER BY last_seen_at DESC",
      [context.userId],
    );
    const stale = rows.slice(2).map((r) => r.id);
    if (stale.length > 0) {
      await mysqlQuery(
        `DELETE FROM user_trusted_devices WHERE id IN (${stale.map(() => "?").join(",")})`,
        stale,
      );
    }
    return { ok: true };
  });

export type TrustedDeviceRow = {
  id: string;
  device_id: string;
  label: string | null;
  last_ip: string | null;
  trusted_until: string | null;
  last_seen_at: string;
};

export const listMyTrustedDevices = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<TrustedDeviceRow[]> => {
    await ensureTable();
    return mysqlQuery<TrustedDeviceRow>(
      "SELECT id, device_id, label, last_ip, trusted_until, last_seen_at FROM user_trusted_devices WHERE user_id=? ORDER BY last_seen_at DESC",
      [context.userId],
    );
  });

export const removeMyTrustedDevice = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await ensureTable();
    await mysqlQuery("DELETE FROM user_trusted_devices WHERE id=? AND user_id=?", [data.id, context.userId]);
    return { ok: true };
  });
