import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num } from "./mysql.server";

export type ToolKey = "chat" | "translate" | "code" | "summary" | "slogan";
export const TOOL_KEYS: ToolKey[] = ["chat", "translate", "code", "summary", "slogan"];

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid() {
  return crypto.randomUUID();
}

const PRICES: Record<string, Record<number, number>> = {
  fast: { 5: 10, 10: 20 },
  hd: { 5: 25, 10: 50 },
  cinematic: { 5: 50, 10: 100 },
};

export const createAiVideoJob = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        prompt: z.string().min(3).max(1000),
        duration: z.union([z.literal(5), z.literal(10)]),
        aspect: z.enum(["16:9", "9:16", "1:1"]),
        quality: z.enum(["fast", "hd", "cinematic"]).default("fast"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const cost = PRICES[data.quality]?.[data.duration];
    if (!cost) throw new Error("Fiyat bulunamadı.");

    let fromSub = 0;
    const sub = await mysqlOne<{ id: string; credits_remaining: string | number }>(
      "SELECT id,credits_remaining FROM ai_subscriptions WHERE user_id=? AND status='active' AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1",
      [context.userId],
    );
    if (sub) {
      const remaining = num(sub.credits_remaining) ?? 0;
      if (remaining > 0) {
        fromSub = Math.min(cost, remaining);
        await mysqlQuery("UPDATE ai_subscriptions SET credits_remaining=credits_remaining-? WHERE id=?", [
          fromSub,
          sub.id,
        ]);
      }
    }
    const fromWallet = cost - fromSub;
    if (fromWallet > 0) {
      const wallet = await mysqlOne<{ balance_try: string | number | null }>(
        "SELECT balance_try FROM wallets WHERE user_id=?",
        [context.userId],
      );
      const balance = num(wallet?.balance_try) ?? 0;
      if (balance < fromWallet) throw new Error("Yetersiz bakiye.");
      await mysqlQuery(
        `INSERT INTO wallets (user_id,balance_try,updated_at) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE balance_try=balance_try-VALUES(balance_try), updated_at=VALUES(updated_at)`,
        [context.userId, fromWallet, ts()],
      );
      const w2 = await mysqlOne<{ balance_try: string | number | null }>(
        "SELECT balance_try FROM wallets WHERE user_id=?",
        [context.userId],
      );
      await mysqlQuery(
        "INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
        [uid(), context.userId, "purchase", -fromWallet, num(w2?.balance_try) ?? 0, null, "ai_video", ts()],
      );
    }

    const jobId = uid();
    await mysqlQuery(
      `INSERT INTO ai_jobs (id,user_id,kind,prompt,params,cost_try,status,expires_at,provider,created_at,updated_at)
       VALUES (?,?,?,?,?,?,'queued',DATE_ADD(?, INTERVAL 30 DAY),'fal',?,?)`,
      [
        jobId,
        context.userId,
        "video",
        data.prompt,
        JSON.stringify({ duration: data.duration, aspect: data.aspect, quality: data.quality, from_sub: fromSub, from_wallet: fromWallet }),
        cost,
        ts(),
        ts(),
        ts(),
      ],
    );
    return { jobId };
  });

export const getAiVideoPrices = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const profile = await mysqlOne<{ tier: string | null }>("SELECT tier FROM profiles WHERE id=?", [
      context.userId,
    ]);
    const discount = ["gold", "platinum"].includes((profile?.tier ?? "").toLowerCase()) ? 0.8 : 1;
    const map: Record<string, Record<number, number>> = {};
    for (const [quality, byDuration] of Object.entries(PRICES)) {
      map[quality] = {};
      for (const [d, price] of Object.entries(byDuration)) {
        map[quality][Number(d)] = Math.round(price * discount);
      }
    }
    return map;
  });

export const listMyAiJobs = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const rows = await mysqlQuery<Record<string, unknown>>(
      `SELECT id, kind, prompt, params, cost_try, status, result_url, error, created_at
         FROM ai_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 50`,
      [context.userId],
    );
    return rows.map((r) => ({
      ...r,
      cost_try: num(r.cost_try) ?? 0,
      params: (() => {
        if (r.params == null) return {};
        if (typeof r.params === "object") return r.params;
        try {
          return JSON.parse(String(r.params));
        } catch {
          return {};
        }
      })(),
    }));
  });
