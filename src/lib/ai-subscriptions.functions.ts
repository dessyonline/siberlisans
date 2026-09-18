import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num } from "./mysql.server";

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid() {
  return crypto.randomUUID();
}

export const listAiPlans = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await mysqlQuery<{
    slug: string;
    name: string;
    price_try: string | number;
    credits: number;
    yearly_price_try: string | number | null;
    yearly_credits: number | null;
    perks: string | null;
    sort_order: number;
  }>(
    `SELECT slug,name,price_try,credits,yearly_price_try,yearly_credits,perks,sort_order
       FROM ai_subscription_plans WHERE is_active=1 ORDER BY sort_order`,
  );
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    price_try: num(r.price_try) ?? 0,
    credits: Number(r.credits),
    yearly_price_try: r.yearly_price_try == null ? null : num(r.yearly_price_try),
    yearly_credits: r.yearly_credits == null ? null : Number(r.yearly_credits),
    perks: (() => {
      if (!r.perks) return [];
      try {
        const parsed = typeof r.perks === "string" ? JSON.parse(r.perks) : r.perks;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
  }));
});

export const getMyAiSubscription = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const row = await mysqlOne<{
      id: string;
      plan_slug: string;
      billing: string;
      credits_total: number;
      credits_remaining: string | number;
      started_at: string;
      expires_at: string;
      status: string;
    }>(
      `SELECT id,plan_slug,billing,credits_total,credits_remaining,started_at,expires_at,status
         FROM ai_subscriptions
        WHERE user_id=? AND status='active' AND expires_at > NOW()
        ORDER BY expires_at DESC LIMIT 1`,
      [context.userId],
    );
    if (!row) return null;
    return {
      id: row.id,
      plan_slug: row.plan_slug,
      billing: row.billing,
      credits_total: Number(row.credits_total),
      credits_remaining: num(row.credits_remaining) ?? 0,
      started_at: row.started_at,
      expires_at: row.expires_at,
      status: row.status,
    };
  });

const purchaseInput = z.object({
  planSlug: z.enum(["starter", "pro", "studio"]),
  billing: z.enum(["monthly", "yearly"]).default("monthly"),
});

export const purchaseAiSubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => purchaseInput.parse(d))
  .handler(async ({ data, context }) => {
    const plan = await mysqlOne<{
      slug: string;
      price_try: string | number;
      credits: number;
      yearly_price_try: string | number | null;
      yearly_credits: number | null;
    }>(
      "SELECT slug,price_try,credits,yearly_price_try,yearly_credits FROM ai_subscription_plans WHERE slug=? AND is_active=1",
      [data.planSlug],
    );
    if (!plan) throw new Error("Plan bulunamadı.");

    const price = data.billing === "yearly" ? num(plan.yearly_price_try) ?? (num(plan.price_try) ?? 0) * 12 : num(plan.price_try) ?? 0;
    const credits = data.billing === "yearly" ? plan.yearly_credits ?? plan.credits * 12 : plan.credits;
    const days = data.billing === "yearly" ? 365 : 30;

    const wallet = await mysqlOne<{ balance_try: string | number | null }>(
      "SELECT balance_try FROM wallets WHERE user_id=?",
      [context.userId],
    );
    const balance = num(wallet?.balance_try) ?? 0;
    if (balance < price) throw new Error("Yetersiz bakiye.");

    await mysqlQuery(
      `INSERT INTO wallets (user_id,balance_try,updated_at) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE balance_try=balance_try-VALUES(balance_try), updated_at=VALUES(updated_at)`,
      [context.userId, price, ts()],
    );
    const w2 = await mysqlOne<{ balance_try: string | number | null }>(
      "SELECT balance_try FROM wallets WHERE user_id=?",
      [context.userId],
    );
    await mysqlQuery(
      "INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [uid(), context.userId, "purchase", -price, num(w2?.balance_try) ?? 0, null, `AI abonelik: ${data.planSlug}/${data.billing}`, ts()],
    );

    await mysqlQuery("UPDATE ai_subscriptions SET status='expired' WHERE user_id=? AND status='active'", [
      context.userId,
    ]);

    const id = uid();
    await mysqlQuery(
      `INSERT INTO ai_subscriptions (id,user_id,plan_slug,billing,credits_total,credits_remaining,price_paid,started_at,expires_at,status,created_at)
       VALUES (?,?,?,?,?,?,?,?,DATE_ADD(?, INTERVAL ? DAY),'active',?)`,
      [id, context.userId, data.planSlug, data.billing, credits, credits, price, ts(), ts(), days, ts()],
    );

    return { id };
  });
