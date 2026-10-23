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

type AiPlanRow = {
  slug: string;
  price_try: string | number;
  credits: number;
  yearly_price_try: string | number | null;
  yearly_credits: number | null;
};

type SafePlanFloor = {
  name: string;
  price_try: number;
  credits: number;
  yearly_price_try: number;
  yearly_credits: number;
  perks: string[];
};

const SAFE_PLAN_FLOORS: Record<string, SafePlanFloor> = {
  starter: {
    name: "Başlangıç",
    price_try: 500,
    credits: 500,
    yearly_price_try: 5700,
    yearly_credits: 6000,
    perks: ["~6 hızlı video", "~2 HD video", "30 gün geçerli", "Başarısız işlerde otomatik iade"],
  },
  pro: {
    name: "Üretici",
    price_try: 1500,
    credits: 1500,
    yearly_price_try: 16200,
    yearly_credits: 18000,
    perks: ["~18 hızlı video", "~8 HD video", "~6 sinematik video", "30 gün geçerli"],
  },
  studio: {
    name: "Stüdyo",
    price_try: 5000,
    credits: 5000,
    yearly_price_try: 51000,
    yearly_credits: 60000,
    perks: ["~63 hızlı video", "~27 HD video", "~21 sinematik video", "Öncelikli multi-scene kullanım"],
  },
};

function safePlanValues(slug: string, row: AiPlanRow) {
  const floor = SAFE_PLAN_FLOORS[slug];
  const monthlyPrice = num(row.price_try) ?? 0;
  const monthlyCredits = Number(row.credits) || 0;
  const yearlyPrice = num(row.yearly_price_try) ?? monthlyPrice * 12;
  const yearlyCredits = Number(row.yearly_credits) || monthlyCredits * 12;

  return {
    name: floor?.name,
    price_try: Math.max(monthlyPrice, floor?.price_try ?? 0),
    credits: Math.max(monthlyCredits, floor?.credits ?? 0),
    yearly_price_try: Math.max(yearlyPrice, floor?.yearly_price_try ?? 0),
    yearly_credits: Math.max(yearlyCredits, floor?.yearly_credits ?? 0),
    perks: floor?.perks,
  };
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
  return rows.map((r) => {
    const safe = safePlanValues(r.slug, r);
    return {
      slug: r.slug,
      name: safe.name ?? r.name,
      price_try: safe.price_try,
      credits: safe.credits,
      yearly_price_try: safe.yearly_price_try,
      yearly_credits: safe.yearly_credits,
      perks: safe.perks ?? (() => {
        if (!r.perks) return [];
        try {
          const parsed = typeof r.perks === "string" ? JSON.parse(r.perks) : r.perks;
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
    };
  });
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

    const safe = safePlanValues(plan.slug, plan);
    const price = data.billing === "yearly" ? safe.yearly_price_try : safe.price_try;
    const credits = data.billing === "yearly" ? safe.yearly_credits : safe.credits;
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
