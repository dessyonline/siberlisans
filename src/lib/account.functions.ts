import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";

export const getAccountHero = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { mysqlOne, num } = await import("./mysql.server");
    const [profile, wallet] = await Promise.all([
      mysqlOne<{
        display_name: string | null;
        avatar_id: string | null;
        tier: string | null;
        total_points: unknown;
        created_at: string | null;
      }>("SELECT display_name, avatar_id, tier, total_points, created_at FROM profiles WHERE id=?", [context.userId]),
      mysqlOne<{ balance_try: unknown }>("SELECT balance_try FROM wallets WHERE user_id=?", [context.userId]),
    ]);
    return {
      display_name: profile?.display_name ?? null,
      avatar_id: profile?.avatar_id ?? null,
      tier: profile?.tier ?? null,
      total_points: num(profile?.total_points) ?? 0,
      created_at: profile?.created_at ?? null,
      balance_try: num(wallet?.balance_try) ?? 0,
    };
  });

export const updateDisplayName = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ displayName: z.string().trim().min(2).max(60) }).parse(input))
  .handler(async ({ data, context }) => {
    const { mysqlQuery } = await import("./mysql.server");
    await mysqlQuery("UPDATE profiles SET display_name=? WHERE id=?", [data.displayName, context.userId]);
    return { ok: true };
  });

export type ActivityItem = {
  id: string;
  ts: string;
  kind: "order" | "wallet" | "notification";
  status?: string;
  title: string;
  detail: string;
  amount?: number;
};

/** Hesap aktivite akışı: siparişler + cüzdan hareketleri + bildirimler. */
export const getAccountActivity = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<ActivityItem[]> => {
    const { mysqlQuery, num } = await import("./mysql.server");
    const userId = context.userId;

    const [orders, txns, notifs] = await Promise.all([
      mysqlQuery<{
        id: string;
        status: string;
        price_try: unknown;
        reference_code: string | null;
        created_at: string;
        product_name: string | null;
      }>(
        `SELECT o.id, o.status, o.price_try, o.reference_code, o.created_at, p.name AS product_name
           FROM orders o LEFT JOIN products p ON p.id = o.product_id
          WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 6`,
        [userId],
      ),
      mysqlQuery<{
        id: string;
        kind: string;
        amount_try: unknown;
        note: string | null;
        created_at: string;
      }>(
        `SELECT id, kind, amount_try, note, created_at FROM wallet_transactions
          WHERE user_id=? ORDER BY created_at DESC LIMIT 6`,
        [userId],
      ),
      mysqlQuery<{ id: string; title: string; body: string | null; created_at: string }>(
        `SELECT id, title, body, created_at FROM notifications
          WHERE user_id=? ORDER BY created_at DESC LIMIT 6`,
        [userId],
      ),
    ]);

    const out: ActivityItem[] = [];

    for (const o of orders) {
      out.push({
        id: `o-${o.id}`,
        ts: o.created_at,
        kind: "order",
        status: o.status,
        title: o.product_name ?? "Sipariş",
        detail: `${o.reference_code ?? ""} · ₺${(num(o.price_try) ?? 0).toLocaleString("tr-TR")} · ${o.status}`,
      });
    }

    for (const t of txns) {
      const amt = num(t.amount_try) ?? 0;
      out.push({
        id: `t-${t.id}`,
        ts: t.created_at,
        kind: "wallet",
        title: t.kind === "topup" ? "Bakiye yükleme" : t.kind === "purchase" ? "Satın alma" : t.kind,
        detail: `${amt >= 0 ? "+" : ""}${amt.toLocaleString("tr-TR")} ₺${t.note ? ` · ${t.note}` : ""}`,
        amount: amt,
      });
    }

    for (const n of notifs) {
      out.push({
        id: `n-${n.id}`,
        ts: n.created_at,
        kind: "notification",
        title: n.title,
        detail: n.body ?? "",
      });
    }

    return out.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 14);
  });
