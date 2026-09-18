import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num, bool } from "./mysql.server";

export type SubscriptionRow = {
  id: string;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
  status: "active" | "paused" | "canceled" | "failed";
  autoRenew: boolean;
  intervalDays: number;
  priceTry: number;
  nextRenewalAt: string;
  lastRenewedAt: string | null;
  failureCount: number;
  lastOrderId: string | null;
  createdAt: string;
};

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid() {
  return crypto.randomUUID();
}
function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function genRef() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "REN-";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function logAttempt(
  subId: string,
  outcome: string,
  extra: { error_message?: string | null; order_id?: string | null; amount_try?: number | null } = {},
) {
  try {
    await mysqlQuery(
      "INSERT INTO subscription_renewal_attempts (id,subscription_id,attempted_at,outcome,error_message,order_id,amount_try) VALUES (?,?,?,?,?,?,?)",
      [uid(), subId, ts(), outcome, extra.error_message ?? null, extra.order_id ?? null, extra.amount_try ?? null],
    );
  } catch (e) {
    console.error("[subs] attempt log failed", (e as Error).message);
  }
}

export const listMySubscriptions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const rows = await mysqlQuery<{
      id: string;
      product_id: string | null;
      status: SubscriptionRow["status"];
      auto_renew: number;
      interval_days: number;
      price_try: string | number;
      next_renewal_at: string;
      last_renewed_at: string | null;
      failure_count: number;
      last_order_id: string | null;
      created_at: string;
      product_name: string | null;
      product_slug: string | null;
    }>(
      `SELECT s.id, s.product_id, s.status, s.auto_renew, s.interval_days, s.price_try,
              s.next_renewal_at, s.last_renewed_at, s.failure_count, s.last_order_id, s.created_at,
              p.name product_name, p.slug product_slug
         FROM subscriptions s
         LEFT JOIN products p ON p.id = s.product_id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC`,
      [context.userId],
    );
    return rows.map<SubscriptionRow>((r) => ({
      id: r.id,
      productId: r.product_id,
      productName: r.product_name,
      productSlug: r.product_slug,
      status: r.status,
      autoRenew: bool(r.auto_renew),
      intervalDays: Number(r.interval_days),
      priceTry: num(r.price_try) ?? 0,
      nextRenewalAt: r.next_renewal_at,
      lastRenewedAt: r.last_renewed_at,
      failureCount: Number(r.failure_count),
      lastOrderId: r.last_order_id,
      createdAt: r.created_at,
    }));
  });

const idInput = z.object({ subscriptionId: z.string().uuid() });
const toggleInput = z.object({ subscriptionId: z.string().uuid(), on: z.boolean() });

async function loadOwnedSub(subId: string, userId: string, isAdmin: boolean) {
  const sub = await mysqlOne<{ id: string; user_id: string; status: string; failure_count: number }>(
    "SELECT id,user_id,status,failure_count FROM subscriptions WHERE id=?",
    [subId],
  );
  if (!sub) throw new Error("Abonelik bulunamadı");
  if (sub.user_id !== userId && !isAdmin) throw new Error("Yetkisiz");
  return sub;
}

export const setSubscriptionAutoRenew = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => toggleInput.parse(d))
  .handler(async ({ data, context }) => {
    const sub = await loadOwnedSub(data.subscriptionId, context.userId, context.isAdmin);
    if (data.on && sub.status === "failed") {
      await mysqlQuery(
        "UPDATE subscriptions SET auto_renew=1, status='active', failure_count=0, updated_at=? WHERE id=?",
        [ts(), data.subscriptionId],
      );
    } else {
      await mysqlQuery("UPDATE subscriptions SET auto_renew=?, updated_at=? WHERE id=?", [
        data.on ? 1 : 0,
        ts(),
        data.subscriptionId,
      ]);
    }
    return { ok: true };
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    await loadOwnedSub(data.subscriptionId, context.userId, context.isAdmin);
    await mysqlQuery(
      "UPDATE subscriptions SET status='canceled', auto_renew=0, canceled_at=?, updated_at=? WHERE id=?",
      [ts(), ts(), data.subscriptionId],
    );
    return { ok: true };
  });

export const renewSubscriptionNow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const sub = await mysqlOne<{
      id: string;
      user_id: string;
      product_id: string | null;
      status: string;
      auto_renew: number;
      interval_days: number;
      price_try: string | number;
      failure_count: number;
    }>(
      "SELECT id,user_id,product_id,status,auto_renew,interval_days,price_try,failure_count FROM subscriptions WHERE id=?",
      [data.subscriptionId],
    );
    if (!sub || sub.user_id !== context.userId) {
      throw new Error("Abonelik bulunamadı");
    }

    if (sub.status !== "active" || !bool(sub.auto_renew)) {
      await logAttempt(sub.id, "canceled", { error_message: "Sub not active or auto_renew off" });
      return { outcome: "canceled", orderId: null, licenseKey: null };
    }

    if (!sub.product_id) {
      await mysqlQuery("UPDATE subscriptions SET status='failed', auto_renew=0, updated_at=? WHERE id=?", [
        ts(),
        sub.id,
      ]);
      await logAttempt(sub.id, "error", { error_message: "Product no longer exists" });
      return { outcome: "error", orderId: null, licenseKey: null };
    }

    const product = await mysqlOne<{ price_try: string | number | null }>(
      "SELECT price_try FROM products WHERE id=?",
      [sub.product_id],
    );
    const price = num(product?.price_try) ?? num(sub.price_try) ?? 0;

    const wallet = await mysqlOne<{ balance_try: string | number | null }>(
      "SELECT balance_try FROM wallets WHERE user_id=?",
      [sub.user_id],
    );
    const balance = num(wallet?.balance_try) ?? 0;

    if (balance < price) {
      const newFailCount = Number(sub.failure_count) + 1;
      const willFail = newFailCount >= 3;
      await mysqlQuery(
        `UPDATE subscriptions SET failure_count=?, last_attempt_at=?,
           status = CASE WHEN ? THEN 'failed' ELSE status END,
           auto_renew = CASE WHEN ? THEN 0 ELSE auto_renew END,
           updated_at=? WHERE id=?`,
        [newFailCount, ts(), willFail ? 1 : 0, willFail ? 1 : 0, ts(), sub.id],
      );
      await logAttempt(sub.id, "insufficient_funds", {
        error_message: `Balance ${balance} < ${price}`,
        amount_try: price,
      });
      return { outcome: "insufficient_funds", orderId: null, licenseKey: null };
    }

    const referenceCode = genRef();
    const orderId = uid();
    await mysqlQuery(
      `INSERT INTO orders (id,user_id,product_id,price_try,reference_code,status,item_count,approved_at,paid_with,created_at,updated_at)
       VALUES (?,?,?,?,?,'approved',1,?,'wallet',?,?)`,
      [orderId, sub.user_id, sub.product_id, price, referenceCode, ts(), ts(), ts()],
    );

    await mysqlQuery(
      `INSERT INTO wallets (user_id,balance_try,updated_at) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE balance_try=balance_try-VALUES(balance_try), updated_at=VALUES(updated_at)`,
      [sub.user_id, price, ts()],
    );
    const w2 = await mysqlOne<{ balance_try: string | number | null }>(
      "SELECT balance_try FROM wallets WHERE user_id=?",
      [sub.user_id],
    );
    await mysqlQuery(
      "INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [uid(), sub.user_id, "purchase", -price, num(w2?.balance_try) ?? 0, orderId, `Abonelik yenileme: ${referenceCode}`, ts()],
    );

    // Assign key from pool
    const cand = await mysqlOne<{ id: string; key_value: string | null }>(
      "SELECT id,key_value FROM license_keys WHERE product_id=? AND status='available' ORDER BY created_at ASC LIMIT 1",
      [sub.product_id],
    );

    if (!cand) {
      // rollback
      await mysqlQuery(
        `INSERT INTO wallets (user_id,balance_try,updated_at) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE balance_try=balance_try+VALUES(balance_try), updated_at=VALUES(updated_at)`,
        [sub.user_id, price, ts()],
      );
      const w3 = await mysqlOne<{ balance_try: string | number | null }>(
        "SELECT balance_try FROM wallets WHERE user_id=?",
        [sub.user_id],
      );
      await mysqlQuery(
        "INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
        [uid(), sub.user_id, "refund", price, num(w3?.balance_try) ?? 0, orderId, "Yenileme başarısız iade", ts()],
      );
      await mysqlQuery("UPDATE orders SET status='failed', updated_at=? WHERE id=?", [ts(), orderId]);

      const newFailCount = Number(sub.failure_count) + 1;
      const willFail = newFailCount >= 3;
      await mysqlQuery(
        `UPDATE subscriptions SET failure_count=?, last_attempt_at=?,
           status = CASE WHEN ? THEN 'failed' ELSE status END,
           auto_renew = CASE WHEN ? THEN 0 ELSE auto_renew END,
           updated_at=? WHERE id=?`,
        [newFailCount, ts(), willFail ? 1 : 0, willFail ? 1 : 0, ts(), sub.id],
      );
      await logAttempt(sub.id, "no_stock", { order_id: orderId, amount_try: price, error_message: "Stokta anahtar yok" });
      return { outcome: "no_stock", orderId, licenseKey: null };
    }

    const token = randomHex(16);
    await mysqlQuery(
      `UPDATE license_keys SET status='assigned', assigned_order_id=?, assigned_at=?,
              activation_token=COALESCE(activation_token,?) WHERE id=? AND status='available'`,
      [orderId, ts(), token, cand.id],
    );
    await mysqlQuery("INSERT INTO order_keys (id,order_id,license_key_id,delivered_at) VALUES (?,?,?,?)", [
      uid(),
      orderId,
      cand.id,
      ts(),
    ]);

    await mysqlQuery(
      `UPDATE subscriptions SET last_order_id=?, current_license_key_id=?, last_renewed_at=?, last_attempt_at=?,
              next_renewal_at=DATE_ADD(?, INTERVAL ? DAY), failure_count=0, updated_at=? WHERE id=?`,
      [orderId, cand.id, ts(), ts(), ts(), sub.interval_days, ts(), sub.id],
    );
    await logAttempt(sub.id, "success", { order_id: orderId, amount_try: price });

    return { outcome: "success", orderId, licenseKey: cand.key_value };
  });

export type AdminSubscriptionRow = {
  id: string;
  status: "active" | "paused" | "canceled" | "failed";
  autoRenew: boolean;
  intervalDays: number;
  priceTry: number;
  nextRenewalAt: string;
  lastRenewedAt: string | null;
  failureCount: number;
  userId: string;
  product: { name: string; slug: string } | null;
  profile: { email: string | null; displayName: string | null } | null;
};

export const adminListSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminSubscriptionRow[]> => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const rows = await mysqlQuery<{
      id: string;
      status: AdminSubscriptionRow["status"];
      auto_renew: number;
      interval_days: number;
      price_try: string | number;
      next_renewal_at: string;
      last_renewed_at: string | null;
      failure_count: number;
      user_id: string;
      product_name: string | null;
      product_slug: string | null;
      email: string | null;
      display_name: string | null;
    }>(
      `SELECT s.id, s.status, s.auto_renew, s.interval_days, s.price_try, s.next_renewal_at,
              s.last_renewed_at, s.failure_count, s.user_id,
              p.name product_name, p.slug product_slug,
              pr.email, pr.display_name
         FROM subscriptions s
         LEFT JOIN products p ON p.id = s.product_id
         LEFT JOIN profiles pr ON pr.id = s.user_id
        ORDER BY s.next_renewal_at ASC
        LIMIT 500`,
    );
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      autoRenew: bool(r.auto_renew),
      intervalDays: Number(r.interval_days),
      priceTry: num(r.price_try) ?? 0,
      nextRenewalAt: r.next_renewal_at,
      lastRenewedAt: r.last_renewed_at,
      failureCount: Number(r.failure_count),
      userId: r.user_id,
      product: r.product_name ? { name: r.product_name, slug: r.product_slug ?? "" } : null,
      profile: r.email || r.display_name ? { email: r.email, displayName: r.display_name } : null,
    }));
  });
