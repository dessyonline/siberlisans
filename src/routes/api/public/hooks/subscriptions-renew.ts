import { createFileRoute } from "@tanstack/react-router";
import { mysqlQuery, mysqlExec, mysqlOne, num, bool } from "@/lib/mysql.server";
import { assignKeyToOrder } from "@/lib/license-mysql.server";
import { requireCron } from "@/lib/cron-auth.server";

function ts(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid(): string {
  return crypto.randomUUID();
}
function genRef(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "REN-";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

type SubRow = {
  id: string;
  user_id: string;
  product_id: string | null;
  status: string;
  auto_renew: number;
  interval_days: number;
  price_try: string | number;
  failure_count: number;
};

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
    console.error("[subscriptions-renew] attempt log failed", (e as Error).message);
  }
}

/** Ports `renew_subscription` (Postgres RPC) to MySQL. */
async function renewSubscription(subId: string): Promise<"success" | "insufficient_funds" | "no_stock" | "error" | "canceled"> {
  const sub = await mysqlOne<SubRow>(
    "SELECT id,user_id,product_id,status,auto_renew,interval_days,price_try,failure_count FROM subscriptions WHERE id=?",
    [subId],
  );
  if (!sub) return "error";

  if (sub.status !== "active" || !bool(sub.auto_renew)) {
    await logAttempt(subId, "canceled", { error_message: "Sub not active or auto_renew off" });
    return "canceled";
  }

  if (!sub.product_id) {
    await mysqlQuery("UPDATE subscriptions SET status='failed', auto_renew=0, updated_at=? WHERE id=?", [ts(), subId]);
    await logAttempt(subId, "error", { error_message: "Product no longer exists" });
    return "error";
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
      [newFailCount, ts(), willFail ? 1 : 0, willFail ? 1 : 0, ts(), subId],
    );
    await logAttempt(subId, "insufficient_funds", { error_message: `Balance ${balance} < ${price}`, amount_try: price });
    return "insufficient_funds";
  }

  const referenceCode = genRef();
  const orderId = uid();
  await mysqlQuery(
    `INSERT INTO orders (id,user_id,product_id,price_try,reference_code,status,item_count,approved_at,paid_with,created_at,updated_at)
     VALUES (?,?,?,?,?,'approved',1,?,'wallet',?,?)`,
    [orderId, sub.user_id, sub.product_id, price, referenceCode, ts(), ts(), ts()],
  );

  // Atomic debit: the balance check and the deduction happen in one statement,
  // so two concurrent renewals can never both pass the earlier balance check.
  const debited = await mysqlExec(
    "UPDATE wallets SET balance_try = balance_try - ?, updated_at=? WHERE user_id=? AND balance_try >= ?",
    [price, ts(), sub.user_id, price],
  );
  if (debited < 1) {
    await mysqlQuery("UPDATE orders SET status='failed', updated_at=? WHERE id=?", [ts(), orderId]);
    await logAttempt(subId, "insufficient_funds", { error_message: "Concurrent debit / insufficient balance", amount_try: price });
    return "insufficient_funds";
  }
  const w2 = await mysqlOne<{ balance_try: string | number | null }>("SELECT balance_try FROM wallets WHERE user_id=?", [sub.user_id]);
  await mysqlQuery(
    "INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
    [uid(), sub.user_id, "purchase", -price, num(w2?.balance_try) ?? 0, orderId, `Abonelik yenileme: ${referenceCode}`, ts()],
  );

  try {
    const { licenseKey } = await assignKeyToOrder(orderId);

    const orderKey = await mysqlOne<{ license_key_id: string | null }>(
      "SELECT license_key_id FROM order_keys WHERE order_id=? LIMIT 1",
      [orderId],
    );

    await mysqlQuery(
      `UPDATE subscriptions SET last_order_id=?, current_license_key_id=?, last_renewed_at=?, last_attempt_at=?,
         next_renewal_at = DATE_ADD(?, INTERVAL ? DAY), failure_count=0, updated_at=? WHERE id=?`,
      [orderId, orderKey?.license_key_id ?? null, ts(), ts(), ts(), sub.interval_days, ts(), subId],
    );
    await logAttempt(subId, "success", { order_id: orderId, amount_try: price });
    void licenseKey;
    return "success";
  } catch (e) {
    await mysqlQuery("UPDATE wallets SET balance_try = balance_try + ?, updated_at=? WHERE user_id=?", [price, ts(), sub.user_id]);
    const w3 = await mysqlOne<{ balance_try: string | number | null }>("SELECT balance_try FROM wallets WHERE user_id=?", [sub.user_id]);
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
      [newFailCount, ts(), willFail ? 1 : 0, willFail ? 1 : 0, ts(), subId],
    );
    await logAttempt(subId, "no_stock", { error_message: (e as Error).message, order_id: orderId, amount_try: price });
    return "no_stock";
  }
}

/** Ports `process_due_subscriptions` (Postgres RPC) to MySQL. */
async function processDueSubscriptions(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const due = await mysqlQuery<{ id: string }>(
    `SELECT id FROM subscriptions
      WHERE status = 'active'
        AND auto_renew = 1
        AND next_renewal_at <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
        AND (last_attempt_at IS NULL OR last_attempt_at < DATE_SUB(NOW(), INTERVAL 6 HOUR))
      ORDER BY next_renewal_at ASC
      LIMIT 200`,
  );

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  for (const s of due) {
    try {
      // Claim the row before doing any money work. The same guard used by the
      // SELECT is repeated here, so a second worker (or a second cron tick)
      // gets 0 affected rows and skips the subscription.
      const claimed = await mysqlExec(
        `UPDATE subscriptions SET last_attempt_at = NOW(), updated_at = NOW()
          WHERE id = ?
            AND status = 'active'
            AND auto_renew = 1
            AND (last_attempt_at IS NULL OR last_attempt_at < DATE_SUB(NOW(), INTERVAL 6 HOUR))`,
        [s.id],
      );
      if (claimed < 1) continue;

      const outcome = await renewSubscription(s.id);
      processed++;
      if (outcome === "success") succeeded++;
      else failed++;
    } catch (e) {
      failed++;
      await logAttempt(s.id, "error", { error_message: (e as Error).message });
    }
  }
  return { processed, succeeded, failed };
}

export const Route = createFileRoute("/api/public/hooks/subscriptions-renew")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCron(request);
        if (unauth) return unauth;

        try {
          const row = await processDueSubscriptions();

          // Best-effort Telegram summary
          if (row.processed > 0) {
            try {
              const { notifyTelegram } = await import("@/lib/telegram.server");
              await notifyTelegram(
                `🔁 <b>Abonelik yenileme</b>\nİşlenen: ${row.processed}\nBaşarılı: ${row.succeeded}\nBaşarısız: ${row.failed}`,
              );
            } catch {
              /* ignore */
            }
          }

          return Response.json({ ok: true, ...row });
        } catch (e) {
          console.error("[cron] subscriptions-renew", (e as Error).message);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
