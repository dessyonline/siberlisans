import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num } from "./mysql.server";

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export const getMyPointsProfile = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const row = await mysqlOne<{ total_points: number | null; tier: string | null }>(
      "SELECT total_points, tier FROM profiles WHERE id=? LIMIT 1",
      [context.userId],
    );
    return { points: row?.total_points ?? 0, tier: row?.tier ?? "bronze" };
  });

export const spendPointsForOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ orderId: z.string(), amount: z.number().int().min(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const order = await mysqlOne<{ id: string; user_id: string; price_try: unknown; status: string }>(
      "SELECT id, user_id, price_try, status FROM orders WHERE id=? LIMIT 1",
      [data.orderId],
    );
    if (!order || order.user_id !== context.userId) throw new Error("Sipariş bulunamadı.");
    if (order.status === "approved") throw new Error("Onaylanmış siparişte puan kullanılamaz.");

    const otherDiscount = await mysqlOne<{ id: string }>(
      "SELECT id FROM order_discounts WHERE order_id=? AND code_snapshot NOT LIKE 'PUAN-%' LIMIT 1",
      [data.orderId],
    );
    if (otherDiscount) throw new Error("Bu siparişte zaten başka bir indirim uygulanmış.");

    const prof = await mysqlOne<{ total_points: number | null }>(
      "SELECT total_points FROM profiles WHERE id=? LIMIT 1",
      [context.userId],
    );
    const balance = Number(prof?.total_points ?? 0);
    if (balance < data.amount) throw new Error("Yetersiz puan.");

    // Refund any existing points discount on this order first.
    const existingPuan = await mysqlOne<{ code_snapshot: string | null }>(
      "SELECT code_snapshot FROM order_discounts WHERE order_id=? AND code_snapshot LIKE 'PUAN-%' LIMIT 1",
      [data.orderId],
    );
    if (existingPuan) {
      const prevAmount = Number(existingPuan.code_snapshot?.split("-")[1] ?? 0);
      if (prevAmount > 0) {
        await mysqlQuery("UPDATE profiles SET total_points=COALESCE(total_points,0)+? WHERE id=?", [
          prevAmount,
          context.userId,
        ]);
      }
      await mysqlQuery("DELETE FROM order_discounts WHERE order_id=? AND code_snapshot LIKE 'PUAN-%'", [
        data.orderId,
      ]);
    }

    const total = num(order.price_try) ?? 0;
    const maxDiscountTry = Math.floor(total * 0.3);
    const discountTry = Math.min(Math.round((data.amount / 100) * 100) / 100, maxDiscountTry);

    await mysqlQuery("UPDATE profiles SET total_points=total_points-? WHERE id=? AND total_points>=?", [
      data.amount,
      context.userId,
      data.amount,
    ]);
    const after = await mysqlOne<{ total_points: number | null }>(
      "SELECT total_points FROM profiles WHERE id=?",
      [context.userId],
    );
    await mysqlQuery(
      `INSERT INTO user_points_ledger (id,user_id,delta,reason,order_id,balance_after,created_at) VALUES (?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), context.userId, -data.amount, "order_discount", data.orderId, after?.total_points ?? 0, ts()],
    );
    await mysqlQuery(
      "INSERT INTO order_discounts (id,order_id,code_snapshot,discount_try,created_at) VALUES (?,?,?,?,?)",
      [crypto.randomUUID(), data.orderId, `PUAN-${data.amount}`, discountTry, ts()],
    );

    return { discount_try: discountTry };
  });

export const refundPointsDiscount = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ orderId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const order = await mysqlOne<{ user_id: string }>("SELECT user_id FROM orders WHERE id=? LIMIT 1", [
      data.orderId,
    ]);
    if (!order || order.user_id !== context.userId) throw new Error("Sipariş bulunamadı.");
    const row = await mysqlOne<{ code_snapshot: string | null }>(
      "SELECT code_snapshot FROM order_discounts WHERE order_id=? AND code_snapshot LIKE 'PUAN-%' LIMIT 1",
      [data.orderId],
    );
    if (!row) return { ok: true };
    const amount = Number(row.code_snapshot?.split("-")[1] ?? 0);
    await mysqlQuery("DELETE FROM order_discounts WHERE order_id=? AND code_snapshot LIKE 'PUAN-%'", [
      data.orderId,
    ]);
    if (amount > 0) {
      await mysqlQuery("UPDATE profiles SET total_points=COALESCE(total_points,0)+? WHERE id=?", [
        amount,
        context.userId,
      ]);
      const after = await mysqlOne<{ total_points: number | null }>(
        "SELECT total_points FROM profiles WHERE id=?",
        [context.userId],
      );
      await mysqlQuery(
        `INSERT INTO user_points_ledger (id,user_id,delta,reason,order_id,balance_after,created_at) VALUES (?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), context.userId, amount, "order_discount_refund", data.orderId, after?.total_points ?? 0, ts()],
      );
    }
    return { ok: true };
  });

export type PointsLedgerRow = {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  created_at: string;
};

export type TierCardData = {
  points: number;
  tier: string;
  ledger: PointsLedgerRow[];
};

export const getTierCard = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<TierCardData> => {
    const prof = await mysqlOne<{ total_points: number | null; tier: string | null }>(
      "SELECT total_points, tier FROM profiles WHERE id=? LIMIT 1",
      [context.userId],
    );
    const ledgerRows = await mysqlQuery<{
      id: string;
      delta: unknown;
      reason: string;
      balance_after: unknown;
      created_at: string;
    }>(
      "SELECT id, delta, reason, balance_after, created_at FROM user_points_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 10",
      [context.userId],
    );
    return {
      points: prof?.total_points ?? 0,
      tier: prof?.tier ?? "bronze",
      ledger: ledgerRows.map((r) => ({
        id: r.id,
        delta: num(r.delta) ?? 0,
        reason: r.reason,
        balance_after: num(r.balance_after) ?? 0,
        created_at: r.created_at,
      })),
    };
  });
