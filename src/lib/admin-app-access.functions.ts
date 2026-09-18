import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-middleware.server";
import { mysqlQuery, mysqlOne } from "@/lib/mysql.server";

const APP_SLUG = "cyberlab";

export type AppAccessRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  expiresAt: string | null;
  lifetime: boolean;
  active: boolean;
  createdAt: string;
  sourceOrderId: string | null;
};

export const listAppAccess = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<AppAccessRow[]> => {
    const rows = await mysqlQuery<{ user_id: string; expires_at: string | null; created_at: string; source_order_id: string | null }>(
      "SELECT user_id, expires_at, created_at, source_order_id FROM app_access WHERE app_slug=? ORDER BY created_at DESC",
      [APP_SLUG],
    );
    const ids = rows.map((r) => r.user_id);
    const nameMap = new Map<string, { email: string | null; display_name: string | null }>();
    if (ids.length > 0) {
      const profiles = await mysqlQuery<{ id: string; email: string | null; display_name: string | null }>(
        `SELECT id, email, display_name FROM profiles WHERE id IN (${ids.map(() => "?").join(",")})`,
        ids,
      );
      profiles.forEach((p) => nameMap.set(p.id, { email: p.email, display_name: p.display_name }));
    }
    const now = Date.now();
    return rows.map((r) => {
      const lifetime = !r.expires_at;
      return {
        userId: r.user_id,
        email: nameMap.get(r.user_id)?.email ?? null,
        displayName: nameMap.get(r.user_id)?.display_name ?? null,
        expiresAt: r.expires_at,
        lifetime,
        active: lifetime || new Date(r.expires_at as string).getTime() > now,
        createdAt: r.created_at,
        sourceOrderId: r.source_order_id,
      };
    });
  });

export const searchUsersForAccess = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(2).max(120) }).parse(d))
  .handler(async ({ data }): Promise<{ id: string; email: string | null; displayName: string | null }[]> => {
    const q = `%${data.q.trim()}%`;
    const profiles = await mysqlQuery<{ id: string; email: string | null; display_name: string | null }>(
      "SELECT id, email, display_name FROM profiles WHERE email LIKE ? OR display_name LIKE ? LIMIT 10",
      [q, q],
    );
    return profiles.map((p) => ({ id: p.id, email: p.email, displayName: p.display_name }));
  });

const grantInput = z.object({
  userId: z.string().uuid(),
  mode: z.enum(["days", "lifetime", "until"]),
  days: z.number().int().min(1).max(3650).optional(),
  until: z.string().optional(),
  extend: z.boolean().optional(),
});

export const grantAppAccess = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => grantInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; expiresAt: string | null }> => {
    const existing = await mysqlOne<{ id: string; expires_at: string | null }>(
      "SELECT id, expires_at FROM app_access WHERE user_id=? AND app_slug=?",
      [data.userId, APP_SLUG],
    );

    let expiresAt: string | null = null;
    if (data.mode === "days") {
      if (!data.days) throw new Error("Gün sayısı gerekli");
      const base =
        data.extend && existing?.expires_at && new Date(existing.expires_at).getTime() > Date.now()
          ? new Date(existing.expires_at).getTime()
          : Date.now();
      expiresAt = new Date(base + data.days * 86400000).toISOString().slice(0, 19).replace("T", " ");
    } else if (data.mode === "until") {
      if (!data.until) throw new Error("Bitiş tarihi gerekli");
      const t = new Date(data.until);
      if (Number.isNaN(t.getTime())) throw new Error("Geçersiz tarih");
      if (t.getTime() < Date.now()) throw new Error("Bitiş tarihi geçmişte olamaz");
      expiresAt = t.toISOString().slice(0, 19).replace("T", " ");
    }

    if (existing) {
      await mysqlQuery("UPDATE app_access SET expires_at=?, updated_at=NOW() WHERE id=?", [expiresAt, existing.id]);
    } else {
      await mysqlQuery(
        "INSERT INTO app_access (id, user_id, app_slug, expires_at, created_at, updated_at) VALUES (?,?,?,?,NOW(),NOW())",
        [crypto.randomUUID(), data.userId, APP_SLUG, expiresAt],
      );
    }

    await mysqlQuery(
      "INSERT INTO admin_audit_log (id,actor_id,action,entity_type,entity_id,metadata,created_at) VALUES (?,?,?,?,?,?,NOW())",
      [
        crypto.randomUUID(),
        context.userId,
        existing ? "app_access_update" : "app_access_grant",
        "app_access",
        data.userId,
        JSON.stringify({ app_slug: APP_SLUG, expires_at: expiresAt, mode: data.mode }),
      ],
    );

    try {
      await mysqlQuery(
        "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,NOW())",
        [
          crypto.randomUUID(),
          data.userId,
          "info",
          "CyberLab erişimin aktif",
          expiresAt
            ? `CyberLab erişimin ${new Date(expiresAt).toLocaleDateString("tr-TR")} tarihine kadar açıldı.`
            : "CyberLab erişimin süresiz olarak açıldı.",
          "/cyberlab",
        ],
      );
    } catch {
      // bildirim opsiyonel
    }

    return { ok: true, expiresAt };
  });

export const revokeAppAccess = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await mysqlQuery("DELETE FROM app_access WHERE user_id=? AND app_slug=?", [data.userId, APP_SLUG]);
    await mysqlQuery(
      "INSERT INTO admin_audit_log (id,actor_id,action,entity_type,entity_id,metadata,created_at) VALUES (?,?,?,?,?,?,NOW())",
      [crypto.randomUUID(), context.userId, "app_access_revoke", "app_access", data.userId, JSON.stringify({ app_slug: APP_SLUG })],
    );
    return { ok: true };
  });
