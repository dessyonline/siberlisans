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

/**
 * AI video fiyatları — KREDİ cinsinden (1 kredi = ₺1, müşteri krediyi cüzdan bakiyesiyle alır).
 * Fiyatlar sağlayıcı API maliyeti, kur/altyapı rezervi ve final render payı içerir.
 * fast düşük maliyetli Kling, hd Seedance, cinematic Seedance 2.5,
 * audio/audio_premium ise Veo 3.1 katmanlarını kullanır.
 * Gold/Platinum indirimi sonrasında da kârlı kalacak şekilde belirlenmiştir.
 */
export const VIDEO_PRICES: Record<VideoQuality, Record<number, number>> = {
  fast: { 5: 79, 10: 149 },
  hd: { 5: 179, 10: 349 },
  cinematic: { 5: 229, 10: 449 },
  audio: { 8: 229 },
  audio_premium: { 8: 449 },
};
export type VideoQuality = "fast" | "hd" | "cinematic" | "audio" | "audio_premium";
const PRICES = VIDEO_PRICES;

/** Tek seferde alınabilecek kredi aralığı. */
export const CREDIT_MIN = 10;
export const CREDIT_MAX = 5000;

async function creditBalance(userId: string) {
  const r = await mysqlOne<{ credits: unknown }>("SELECT credits FROM ai_credit_wallets WHERE user_id=?", [userId]);
  return num(r?.credits) ?? 0;
}

export const getMyAiCredits = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const credits = await creditBalance(context.userId);
    const history = await mysqlQuery<Record<string, unknown>>(
      "SELECT id, kind, amount, balance_after, note, created_at FROM ai_credit_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
      [context.userId],
    );
    return {
      credits,
      history: history.map((h) => ({
        id: String(h.id),
        kind: String(h.kind),
        amount: num(h.amount) ?? 0,
        balance_after: num(h.balance_after) ?? 0,
        note: (h.note as string | null) ?? null,
        created_at: String(h.created_at),
      })),
    };
  });

/** Cüzdan bakiyesiyle kredi satın al (1 kredi = ₺1, süresiz). */
export const buyAiCredits = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ credits: z.number().int().min(CREDIT_MIN).max(CREDIT_MAX) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const priceTry = data.credits; // 1 kredi = ₺1
    const n = await mysqlExec(
      "UPDATE wallets SET balance_try=balance_try-?, updated_at=? WHERE user_id=? AND balance_try >= ?",
      [priceTry, ts(), context.userId, priceTry],
    );
    if (n !== 1) throw new Error("Yetersiz bakiye.");
    try {
      await mysqlQuery(
        `INSERT INTO ai_credit_wallets (user_id,credits,updated_at) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE credits=credits+VALUES(credits), updated_at=VALUES(updated_at)`,
        [context.userId, data.credits, ts()],
      );
    } catch (e) {
      // Kredi yazılamadıysa parayı geri ver.
      await mysqlExec("UPDATE wallets SET balance_try=balance_try+?, updated_at=? WHERE user_id=?", [
        priceTry,
        ts(),
        context.userId,
      ]);
      throw e;
    }
    const credits = await creditBalance(context.userId);
    const w = await mysqlOne<{ balance_try: unknown }>("SELECT balance_try FROM wallets WHERE user_id=?", [
      context.userId,
    ]);
    await mysqlQuery(
      "INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [uid(), context.userId, "purchase", -priceTry, num(w?.balance_try) ?? 0, null, `ai_kredi:${data.credits}`, ts()],
    );
    await mysqlQuery(
      "INSERT INTO ai_credit_transactions (id,user_id,kind,amount,balance_after,job_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [uid(), context.userId, "purchase", data.credits, credits, null, "cüzdandan satın alındı", ts()],
    );
    return { credits };
  });

async function refundVideoReservation(
  userId: string,
  fromSub: number,
  subId: string | null | undefined,
  fromCredits: number,
  note: string,
) {
  const errors: unknown[] = [];

  if (fromCredits > 0) {
    try {
      await mysqlQuery(
        `INSERT INTO ai_credit_wallets (user_id,credits,updated_at) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE credits=credits+VALUES(credits), updated_at=VALUES(updated_at)`,
        [userId, fromCredits, ts()],
      );
      const c = await mysqlOne<{ credits: unknown }>("SELECT credits FROM ai_credit_wallets WHERE user_id=?", [userId]);
      await mysqlQuery(
        "INSERT INTO ai_credit_transactions (id,user_id,kind,amount,balance_after,job_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
        [uid(), userId, "refund", fromCredits, num(c?.credits) ?? 0, null, note, ts()],
      );
    } catch (e) {
      errors.push(e);
    }
  }

  if (fromSub > 0 && subId) {
    try {
      await mysqlExec("UPDATE ai_subscriptions SET credits_remaining=credits_remaining+? WHERE id=?", [
        fromSub,
        subId,
      ]);
    } catch (e) {
      errors.push(e);
    }
  }

  if (errors.length > 0) throw errors[0];
}

export const createAiVideoJob = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        prompt: z.string().min(3).max(1000),
        duration: z.union([z.literal(5), z.literal(8), z.literal(10)]),
        aspect: z.enum(["16:9", "9:16", "1:1"]),
        quality: z.enum(["fast", "hd", "cinematic", "audio", "audio_premium"]).default("fast"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Fiyat her zaman sunucuda hesaplanır (istemciye güvenilmez).
    const cost = await priceFor(context.userId, data.quality, data.duration);
    if (!cost) throw new Error("Bu kalite için bu süre seçilemez.");
    if (data.quality.startsWith("audio") && data.aspect === "1:1")
      throw new Error("Sesli videolar yalnızca 16:9 veya 9:16 olabilir.");

    // Kötüye kullanım koruması.
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

    // Önce abonelik kredisi, sonra satın alınmış kredi — ikisi de koşullu (atomik) düşüm.
    let fromSub = 0;
    const sub = await mysqlOne<{ id: string; credits_remaining: string | number }>(
      "SELECT id,credits_remaining FROM ai_subscriptions WHERE user_id=? AND status='active' AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1",
      [context.userId],
    );
    const remaining = num(sub?.credits_remaining) ?? 0;
    if (sub && remaining > 0) {
      const take = Math.min(cost, Math.floor(remaining));
      if (take > 0) {
        const n = await mysqlExec(
          "UPDATE ai_subscriptions SET credits_remaining=credits_remaining-? WHERE id=? AND credits_remaining >= ?",
          [take, sub.id, take],
        );
        if (n === 1) fromSub = take;
      }
    }

    const fromCredits = cost - fromSub;
    const jobId = uid();
    let reservedCredits = 0;
    try {
      if (fromCredits > 0) {
        const n = await mysqlExec(
          "UPDATE ai_credit_wallets SET credits=credits-?, updated_at=? WHERE user_id=? AND credits >= ?",
          [fromCredits, ts(), context.userId, fromCredits],
        );
        if (n !== 1) {
          throw new Error("Yetersiz kredi.");
        }
        reservedCredits = fromCredits;
        await mysqlQuery(
          "INSERT INTO ai_credit_transactions (id,user_id,kind,amount,balance_after,job_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
          [uid(), context.userId, "spend", -fromCredits, await creditBalance(context.userId), jobId, `video:${data.quality}:${data.duration}s`, ts()],
        );
      }

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
            from_credits: fromCredits,
            sub_id: fromSub > 0 ? sub!.id : null,
          }),
          cost,
          ts(),
          ts(),
          ts(),
        ],
      );
    } catch (e) {
      try {
        await refundVideoReservation(
          context.userId,
          fromSub,
          fromSub > 0 ? sub!.id : null,
          reservedCredits,
          "video kuyruğa alınamadı — otomatik iade",
        );
      } catch (refundError) {
        console.error("[ai-video] reservation refund failed", refundError);
      }
      throw e;
    }
    return { jobId, cost };
  });

const MAX_ACTIVE_JOBS = 2;
const MAX_JOBS_PER_HOUR = 10;

async function tierDiscount(userId: string) {
  const profile = await mysqlOne<{ tier: string | null }>("SELECT tier FROM profiles WHERE id=?", [userId]);
  return ["gold", "platinum"].includes((profile?.tier ?? "").toLowerCase()) ? 0.8 : 1;
}

async function priceFor(userId: string, quality: string, duration: number) {
  const base = PRICES[quality as VideoQuality]?.[duration];
  if (!base) return null;
  return Math.round(base * (await tierDiscount(userId)));
}

export const getAiVideoPrices = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const discount = await tierDiscount(context.userId);
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
      `SELECT id, kind, prompt, params, cost_try, status, result_url, error, created_at, updated_at, expires_at
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
