import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-middleware.server";
import { mysqlQuery, mysqlOne, num } from "@/lib/mysql.server";

type ProfileRow = {
  id: string; email: string | null; display_name: string | null; created_at: string;
  last_seen_ip: string | null; last_seen_at: string | null;
};
type RoleRow = { user_id: string; role: string };
type OrderRow = { user_id: string; status: string; price_try: number; client_ip: string | null; user_agent: string | null; created_at: string };
type TopupRow = { user_id: string; client_ip: string | null; is_vpn: number; created_at: string };
type AuthRow = { id: string; last_sign_in_at: string | null; email_confirmed_at: string | null };

export type AdminUserRow = {
  id: string; email: string | null; display_name: string | null; created_at: string;
  last_sign_in_at: string | null; email_confirmed: boolean;
  last_seen_ip: string | null; last_seen_at: string | null;
  recent_ips: { ip: string; count: number; last_seen: string; vpn: boolean; ua: string | null }[];
  roles: string[];
  stats: { total: number; approved: number; pending: number; spend: number };
};

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<AdminUserRow[]> => {
    const [profiles, roles, orders, topups, authRows] = await Promise.all([
      mysqlQuery<ProfileRow>("SELECT id, email, display_name, created_at, last_seen_ip, last_seen_at FROM profiles ORDER BY created_at DESC"),
      mysqlQuery<RoleRow>("SELECT user_id, role FROM user_roles"),
      mysqlQuery<OrderRow>("SELECT user_id, status, price_try, client_ip, user_agent, created_at FROM orders ORDER BY created_at DESC"),
      mysqlQuery<TopupRow>("SELECT user_id, client_ip, is_vpn, created_at FROM wallet_topups ORDER BY created_at DESC"),
      mysqlQuery<AuthRow>("SELECT id, last_sign_in_at, email_confirmed_at FROM auth_users"),
    ]);

    const authMap = new Map<string, { last_sign_in_at: string | null; confirmed: boolean }>();
    for (const u of authRows) {
      authMap.set(u.id, { last_sign_in_at: u.last_sign_in_at ?? null, confirmed: !!u.email_confirmed_at });
    }

    const roleMap = new Map<string, string[]>();
    roles.forEach((r) => {
      const list = roleMap.get(r.user_id) ?? [];
      list.push(r.role);
      roleMap.set(r.user_id, list);
    });

    const orderStats = new Map<string, { total: number; approved: number; pending: number; spend: number }>();
    const ipMap = new Map<string, Map<string, { count: number; lastSeen: string; vpn: boolean; ua: string | null }>>();

    const addIp = (uid: string, ip: string | null, ts: string, vpn: boolean, ua: string | null) => {
      if (!uid || !ip) return;
      const bucket = ipMap.get(uid) ?? new Map();
      const prev = bucket.get(ip);
      if (prev) {
        prev.count++;
        if (ts > prev.lastSeen) prev.lastSeen = ts;
        if (vpn) prev.vpn = true;
      } else {
        bucket.set(ip, { count: 1, lastSeen: ts, vpn, ua });
      }
      ipMap.set(uid, bucket);
    };

    orders.forEach((o) => {
      const s = orderStats.get(o.user_id) ?? { total: 0, approved: 0, pending: 0, spend: 0 };
      s.total++;
      if (o.status === "approved") {
        s.approved++;
        s.spend += num(o.price_try) ?? 0;
      }
      if (o.status === "pending" || o.status === "reviewing") s.pending++;
      orderStats.set(o.user_id, s);
      addIp(o.user_id, o.client_ip, o.created_at, false, o.user_agent);
    });

    topups.forEach((t) => {
      addIp(t.user_id, t.client_ip, t.created_at, !!t.is_vpn, null);
    });

    return profiles.map((p) => {
      const a = authMap.get(p.id);
      const ipBucket = ipMap.get(p.id);
      const recentIps = ipBucket
        ? [...ipBucket.entries()]
            .map(([ip, v]) => ({ ip, count: v.count, last_seen: v.lastSeen, vpn: v.vpn, ua: v.ua }))
            .sort((a2, b2) => b2.last_seen.localeCompare(a2.last_seen))
            .slice(0, 8)
        : [];
      return {
        id: p.id,
        email: p.email,
        display_name: p.display_name,
        created_at: p.created_at,
        last_sign_in_at: a?.last_sign_in_at ?? null,
        email_confirmed: a?.confirmed ?? false,
        last_seen_ip: p.last_seen_ip ?? null,
        last_seen_at: p.last_seen_at ?? null,
        recent_ips: recentIps,
        roles: roleMap.get(p.id) ?? [],
        stats: orderStats.get(p.id) ?? { total: 0, approved: 0, pending: 0, spend: 0 },
      };
    });
  });

export type RecentUserActivity = {
  recentSignups: { id: string; email: string | null; display_name: string | null; created_at: string }[];
  recentLogins: { id: string; email: string | null; display_name: string | null; last_sign_in_at: string | null }[];
  totals: { users: number; signedInEver: number; newLast24h: number; activeLast24h: number };
};

export const recentUserActivity = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<RecentUserActivity> => {
    const profiles = await mysqlQuery<{ id: string; email: string | null; display_name: string | null; created_at: string }>(
      "SELECT id, email, display_name, created_at FROM profiles ORDER BY created_at DESC LIMIT 8",
    );
    const authUsers = await mysqlQuery<{ id: string; email: string | null; last_sign_in_at: string | null }>(
      "SELECT id, email, last_sign_in_at FROM auth_users WHERE last_sign_in_at IS NOT NULL",
    );

    const nameMap = new Map<string, string | null>();
    profiles.forEach((p) => nameMap.set(p.id, p.display_name));
    const missing = authUsers.map((u) => u.id).filter((id) => !nameMap.has(id)).slice(0, 100);
    if (missing.length > 0) {
      const extra = await mysqlQuery<{ id: string; display_name: string | null }>(
        `SELECT id, display_name FROM profiles WHERE id IN (${missing.map(() => "?").join(",")})`,
        missing,
      );
      extra.forEach((p) => nameMap.set(p.id, p.display_name));
    }

    const recentLogins = authUsers
      .sort((a, b) => (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? ""))
      .slice(0, 8)
      .map((u) => ({
        id: u.id,
        email: u.email,
        display_name: nameMap.get(u.id) ?? null,
        last_sign_in_at: u.last_sign_in_at,
      }));

    const totalRow = await mysqlOne<{ c: number }>("SELECT COUNT(*) c FROM profiles");
    const totalCount = Number(totalRow?.c ?? 0);

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const newLast24h = profiles.filter((p) => p.created_at > oneDayAgo).length;
    const activeLast24h = authUsers.filter((u) => (u.last_sign_in_at ?? "") > oneDayAgo).length;

    return {
      recentSignups: profiles.map((p) => ({ id: p.id, email: p.email, display_name: p.display_name, created_at: p.created_at })),
      recentLogins,
      totals: { users: totalCount, signedInEver: authUsers.length, newLast24h, activeLast24h },
    };
  });

const setRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "user"]),
  grant: z.boolean(),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => setRoleInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    if (data.userId === context.userId && data.role === "admin" && !data.grant) {
      throw new Error("Kendi admin rolünü kaldıramazsın");
    }
    if (data.grant) {
      await mysqlQuery(
        "INSERT INTO user_roles (user_id, role) VALUES (?, ?) ON DUPLICATE KEY UPDATE role=VALUES(role)",
        [data.userId, data.role],
      );
    } else {
      await mysqlQuery("DELETE FROM user_roles WHERE user_id=? AND role=?", [data.userId, data.role]);
    }
    return { ok: true };
  });

const deleteInput = z.object({ userId: z.string().uuid() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    if (data.userId === context.userId) throw new Error("Kendini silemezsin");
    await mysqlQuery("DELETE FROM auth_sessions WHERE user_id=?", [data.userId]);
    await mysqlQuery("DELETE FROM user_roles WHERE user_id=?", [data.userId]);
    await mysqlQuery("DELETE FROM profiles WHERE id=?", [data.userId]);
    await mysqlQuery("DELETE FROM auth_users WHERE id=?", [data.userId]);
    return { ok: true };
  });

const orderHistoryInput = z.object({ userId: z.string().uuid() });

export type UserOrderRow = {
  id: string; reference_code: string; status: string; price_try: number; created_at: string;
  product: { name: string; slug: string } | null;
};

export const getUserOrders = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => orderHistoryInput.parse(d))
  .handler(async ({ data }): Promise<UserOrderRow[]> => {
    const rows = await mysqlQuery<{
      id: string; reference_code: string; status: string; price_try: number; created_at: string;
      product_name: string | null; product_slug: string | null;
    }>(
      `SELECT o.id, o.reference_code, o.status, o.price_try, o.created_at, p.name product_name, p.slug product_slug
         FROM orders o LEFT JOIN products p ON p.id = o.product_id
        WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 50`,
      [data.userId],
    );
    return rows.map((r) => ({
      id: r.id,
      reference_code: r.reference_code,
      status: r.status,
      price_try: num(r.price_try) ?? 0,
      created_at: r.created_at,
      product: r.product_name ? { name: r.product_name, slug: r.product_slug ?? "" } : null,
    }));
  });
