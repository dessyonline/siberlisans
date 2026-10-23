import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, mysqlExec, num } from "./mysql.server";

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
    // Fiyat her zaman sunucuda, kullanıcının seviyesine göre hesaplanır (istemciye güvenilmez).
    const cost = await priceFor(context.userId, data.quality, data.duration);
    if (!cost) throw new Error("Fiyat bulunamadı.");

    // Kötüye kullanım koruması: aynı anda en fazla 2 aktif iş, saatte en fazla 10 iş.
    const active = await mysqlOne<{ c: string | number }>(
      "SELECT COUNT(*) AS c FROM ai_jobs WHERE user_id=? AND kind='video' AND status IN ('queued','processing')",
      [context.userId],
    );
    if ((num(active?.c) ?? 0) >= MAX_ACTIVE_JOBS)
      throw new Error("Aynı anda en fazla 2 video oluşturabilirsin. Mevcut videoların bitmesini bekle.");
    const hourly = await mysqlOne<{ c: string | number }>(
      "SELECT COUNT(*) AS c FROM ai_jobs WHERE user_id=? AND kind='video' AND created_at > ?",
      [context.userId, ts(new Date(Date.now() - 60 * 60 * 1000))],
    );
    if ((num(hourly?.c) ?? 0) >= MAX_JOBS_PER_HOUR)
      throw new Error("Saatlik video sınırına ulaştın. Biraz sonra tekrar dene.");

    // Abonelik kredisi: koşullu (atomik) düşüm — eşzamanlı isteklerde eksiye düşmez.
    let fromSub = 0;
    const sub = await mysqlOne<{ id: string; credits_remaining: string | number }>(
      "SELECT id,credits_remaining FROM ai_subscriptions WHERE user_id=? AND status='active' AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1",
      [context.userId],
    );
    const remaining = num(sub?.credits_remaining) ?? 0;
    if (sub && remaining > 0) {
      const take = Math.min(cost, remaining);
      const n = await mysqlExec(
        "UPDATE ai_subscriptions SET credits_remaining=credits_remaining-? WHERE id=? AND credits_remaining >= ?",
        [take, sub.id, take],
      );
      if (n === 1) fromSub = take;
    }

    // Cüzdan: yalnızca bakiye yeterliyse düşen tek koşullu UPDATE.
    const fromWallet = cost - fromSub;
    if (fromWallet > 0) {
      const n = await mysqlExec(
        "UPDATE wallets SET balance_try=balance_try-?, updated_at=? WHERE user_id=? AND balance_try >= ?",
        [fromWallet, ts(), context.userId, fromWallet],
      );
      if (n !== 1) {
        if (fromSub > 0) {
          await mysqlExec("UPDATE ai_subscriptions SET credits_remaining=credits_remaining+? WHERE id=?", [
            fromSub,
            sub!.id,
          ]);
        }
        throw new Error("Yetersiz bakiye.");
      }
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
        JSON.stringify({
          duration: data.duration,
          aspect: data.aspect,
          quality: data.quality,
          from_sub: fromSub,
          from_wallet: fromWallet,
          sub_id: fromSub > 0 ? sub!.id : null,
        }),
        cost,
        ts(),
        ts(),
        ts(),
      ],
    );
    return { jobId, cost };
  });

const MAX_ACTIVE_JOBS = 2;
const MAX_JOBS_PER_HOUR = 10;

async function tierDiscount(userId: string) {
  const profile = await mysqlOne<{ tier: string | null }>("SELECT tier FROM profiles WHERE id=?", [userId]);
  return ["gold", "platinum"].includes((profile?.tier ?? "").toLowerCase()) ? 0.8 : 1;
}

async function priceFor(userId: string, quality: string, duration: number) {
  const base = PRICES[quality]?.[duration];
  if (!base) return null;
  return Math.round(base * (await tierDiscount(userId)));
}

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
