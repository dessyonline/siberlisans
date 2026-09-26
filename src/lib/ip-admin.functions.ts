import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-middleware.server";
import { mysqlQuery } from "@/lib/mysql.server";
import { writeAuditLog } from "@/lib/admin-audit.functions";

function mysqlDate(d: Date) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export type BlockedIpRow = {
  ip: string;
  reason: string | null;
  blocked_until: string;
  created_at: string;
  user_id: string | null;
};

export const listBlockedIps = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{ rows: BlockedIpRow[] }> => {
    const rows = await mysqlQuery<BlockedIpRow>(
      "SELECT ip, reason, blocked_until, created_at, user_id FROM ip_blocks WHERE blocked_until > NOW() ORDER BY created_at DESC LIMIT 200",
    );
    return {
      rows: rows.map((r) => ({
        ip: String(r.ip),
        reason: r.reason ?? null,
        blocked_until: r.blocked_until,
        created_at: r.created_at,
        user_id: r.user_id ?? null,
      })),
    };
  });

export type SuspiciousIpRow = {
  ip: string;
  country: string | null;
  vpn: boolean;
  rejected: number;
  total: number;
  last: string;
};

export const listSuspiciousIps = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{ rows: SuspiciousIpRow[] }> => {
    const since = mysqlDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const topups = await mysqlQuery<{
      client_ip: string | null;
      ip_country: string | null;
      is_vpn: number;
      status: string;
      created_at: string;
    }>(
      "SELECT client_ip, ip_country, is_vpn, status, created_at FROM wallet_topups WHERE created_at >= ? AND client_ip IS NOT NULL",
      [since],
    );
    const agg = new Map<string, SuspiciousIpRow>();
    for (const r of topups) {
      const ip = String(r.client_ip);
      const cur = agg.get(ip) ?? { ip, country: r.ip_country ?? null, vpn: false, rejected: 0, total: 0, last: r.created_at };
      cur.total += 1;
      if (r.status === "rejected") cur.rejected += 1;
      if (r.is_vpn) cur.vpn = true;
      if (r.created_at > cur.last) cur.last = r.created_at;
      agg.set(ip, cur);
    }
    const rows = Array.from(agg.values())
      .filter((r) => r.rejected >= 2 || r.vpn)
      .sort((a, b) => b.rejected - a.rejected)
      .slice(0, 50);
    return { rows };
  });

const blockInput = z.object({
  ip: z.string().min(3).max(64),
  reason: z.string().max(200).optional(),
  hours: z.number().min(1).max(24 * 30).default(24),
});

export const blockIp = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => blockInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; blocked_until: string; blocked_accounts: number }> => {
    const until = mysqlDate(new Date(Date.now() + data.hours * 60 * 60 * 1000));
    await mysqlQuery(
      `INSERT INTO ip_blocks (ip, reason, blocked_until, created_at) VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE reason=VALUES(reason), blocked_until=VALUES(blocked_until)`,
      [data.ip, data.reason ?? "manual", until],
    );
    const [orders, topups, profiles] = await Promise.all([
      mysqlQuery<{ user_id: string }>("SELECT DISTINCT user_id FROM orders WHERE client_ip=?", [data.ip]),
      mysqlQuery<{ user_id: string }>("SELECT DISTINCT user_id FROM wallet_topups WHERE client_ip=?", [data.ip]),
      mysqlQuery<{ id: string }>("SELECT id FROM profiles WHERE last_seen_ip=?", [data.ip]),
    ]);
    const userIds = [...new Set([...orders, ...topups].map((row) => row.user_id).concat(profiles.map((row) => row.id)))];
    for (const userId of userIds) {
      await mysqlQuery(
        `INSERT INTO account_blocks (user_id, source_ip, reason, blocked_until, created_at)
         VALUES (?,?,?,?,NOW())
         ON DUPLICATE KEY UPDATE reason=VALUES(reason), source_ip=VALUES(source_ip), blocked_until=VALUES(blocked_until)`,
        [userId, data.ip, data.reason ?? "IP engeli", until],
      );
      await mysqlQuery("DELETE FROM auth_sessions WHERE user_id=?", [userId]);
    }
    await writeAuditLog(context, {
      action: "ip_block",
      entity_type: "ip",
      entity_id: data.ip,
      metadata: { hours: data.hours, reason: data.reason ?? null },
    });
    return { ok: true, blocked_until: until, blocked_accounts: userIds.length };
  });

const unblockInput = z.object({ ip: z.string().min(3).max(64) });

export const unblockIp = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => unblockInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await mysqlQuery("DELETE FROM ip_blocks WHERE ip=?", [data.ip]);
    await mysqlQuery("DELETE FROM account_blocks WHERE source_ip=?", [data.ip]);
    await writeAuditLog(context, {
      action: "ip_unblock",
      entity_type: "ip",
      entity_id: data.ip,
    });
    return { ok: true };
  });
