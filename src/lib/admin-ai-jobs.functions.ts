import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num } from "./mysql.server";

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

type JobParams = Record<string, string | number | boolean | null>;

function parseParams(v: unknown): JobParams {
  if (v == null) return {};
  if (typeof v === "object") return v as JobParams;
  try {
    return JSON.parse(String(v)) as JobParams;
  } catch {
    return {};
  }
}

export type AdminAiJobRow = {
  id: string;
  user_id: string;
  kind: string;
  prompt: string;
  params: JobParams;
  cost_try: number;
  status: string;
  result_url: string | null;
  error: string | null;
  created_at: string;
  provider: string | null;
  provider_model: string | null;
  user: { email: string | null; display_name: string | null; tier: string | null } | null;
};

export const listAdminAiJobs = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["all", "queued", "processing", "completed", "failed"]).default("all"),
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdminAiJobRow[]> => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (data.status !== "all") {
      conditions.push("status=?");
      params.push(data.status);
    }
    if (data.search && data.search.trim()) {
      conditions.push("prompt LIKE ?");
      params.push(`%${data.search.trim()}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(data.limit);

    const jobs = await mysqlQuery<{
      id: string;
      user_id: string;
      kind: string;
      prompt: string;
      params: unknown;
      cost_try: unknown;
      status: string;
      result_url: string | null;
      error: string | null;
      created_at: string;
      provider: string | null;
      provider_model: string | null;
    }>(
      `SELECT id,user_id,kind,prompt,params,cost_try,status,result_url,error,created_at,provider,provider_model
         FROM ai_jobs ${where} ORDER BY created_at DESC LIMIT ?`,
      params,
    );

    const userIds = Array.from(new Set(jobs.map((j) => j.user_id).filter(Boolean)));
    let userMap: Record<string, { email: string | null; display_name: string | null; tier: string | null }> = {};
    if (userIds.length) {
      const placeholders = userIds.map(() => "?").join(",");
      const profs = await mysqlQuery<{ id: string; email: string | null; display_name: string | null; tier: string | null }>(
        `SELECT id, email, display_name, tier FROM profiles WHERE id IN (${placeholders})`,
        userIds,
      );
      for (const p of profs) userMap[p.id] = { email: p.email, display_name: p.display_name, tier: p.tier };
    }

    return jobs.map((j) => ({
      id: j.id,
      user_id: j.user_id,
      kind: j.kind,
      prompt: j.prompt,
      params: parseParams(j.params),
      cost_try: num(j.cost_try) ?? 0,
      status: j.status,
      result_url: j.result_url,
      error: j.error,
      created_at: j.created_at,
      provider: j.provider,
      provider_model: j.provider_model,
      user: userMap[j.user_id] ?? null,
    }));
  });

export type AdminAiStats = {
  totalJobs: number;
  totalCost: number;
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  byTool: Record<string, number>;
  topUsers: Array<{ id: string; email: string | null; display_name: string | null; jobs: number; tool_calls: number }>;
  activeSubs: number;
  subsByPlan: Record<string, number>;
  subRevenue: number;
};

export const getAdminAiStats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminAiStats> => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const since = ts().slice(0, 19).replace(" ", " ");
    const sinceDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const sinceStr = sinceDate.toISOString().slice(0, 19).replace("T", " ");
    const sinceDay = sinceDate.toISOString().slice(0, 10);

    const [jobs, usage, subs] = await Promise.all([
      mysqlQuery<{ status: string; cost_try: unknown; kind: string; user_id: string; created_at: string }>(
        "SELECT status, cost_try, kind, user_id, created_at FROM ai_jobs WHERE created_at >= ?",
        [sinceStr],
      ),
      mysqlQuery<{ tool_key: string; count: unknown; user_id: string; day: string }>(
        "SELECT tool_key, count, user_id, day FROM ai_tool_usage WHERE day >= ?",
        [sinceDay],
      ),
      mysqlQuery<{ plan_slug: string; status: string; price_paid: unknown; credits_total: unknown; credits_remaining: unknown; user_id: string }>(
        "SELECT plan_slug, status, price_paid, credits_total, credits_remaining, user_id FROM ai_subscriptions WHERE status='active'",
      ),
    ]);

    const totalJobs = jobs.length;
    const totalCost = jobs.reduce((s, r) => s + (num(r.cost_try) ?? 0), 0);
    const byStatus: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    const userJobs: Record<string, number> = {};
    for (const r of jobs) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
      userJobs[r.user_id] = (userJobs[r.user_id] ?? 0) + 1;
    }

    const byTool: Record<string, number> = {};
    const userTool: Record<string, number> = {};
    for (const r of usage) {
      byTool[r.tool_key] = (byTool[r.tool_key] ?? 0) + (num(r.count) ?? 0);
      userTool[r.user_id] = (userTool[r.user_id] ?? 0) + (num(r.count) ?? 0);
    }

    const combined: Record<string, number> = { ...userJobs };
    for (const [uid, c] of Object.entries(userTool)) combined[uid] = (combined[uid] ?? 0) + c;
    const topIds = Object.entries(combined)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
    let topUsers: AdminAiStats["topUsers"] = [];
    if (topIds.length) {
      const placeholders = topIds.map(() => "?").join(",");
      const profs = await mysqlQuery<{ id: string; email: string | null; display_name: string | null }>(
        `SELECT id, email, display_name FROM profiles WHERE id IN (${placeholders})`,
        topIds,
      );
      const pm: Record<string, { email: string | null; display_name: string | null }> = {};
      for (const p of profs) pm[p.id] = p;
      topUsers = topIds.map((id) => ({
        id,
        email: pm[id]?.email ?? null,
        display_name: pm[id]?.display_name ?? null,
        jobs: userJobs[id] ?? 0,
        tool_calls: userTool[id] ?? 0,
      }));
    }

    const activeSubs = subs.length;
    const subsByPlan: Record<string, number> = {};
    let subRevenue = 0;
    for (const s of subs) {
      subsByPlan[s.plan_slug] = (subsByPlan[s.plan_slug] ?? 0) + 1;
      subRevenue += num(s.price_paid) ?? 0;
    }

    return { totalJobs, totalCost, byStatus, byKind, byTool, topUsers, activeSubs, subsByPlan, subRevenue };
  });

export type FalBalance = { ok: boolean; error: string | null; balance: number | null; currency: string | null };

export const getFalBalance = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<FalBalance> => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const key = process.env.FAL_API_KEY;
    if (!key) return { ok: false, error: "FAL_API_KEY tanımlı değil", balance: null, currency: null };

    const endpoints = [
      "https://rest.alpha.fal.ai/billing/user/balance",
      "https://rest.alpha.fal.ai/billing/balance",
    ];
    for (const url of endpoints) {
      try {
        const ac = new AbortController();
        const to = setTimeout(() => ac.abort(), 4000);
        const res = await fetch(url, { headers: { Authorization: `Key ${key}` }, signal: ac.signal });
        clearTimeout(to);
        if (!res.ok) continue;
        const j = (await res.json()) as Record<string, unknown>;
        const asNum = (v: unknown) => (typeof v === "number" ? v : null);
        const bal = asNum(j.balance) ?? asNum(j.available) ?? asNum(j.credits) ?? asNum(j.amount) ?? null;
        return { ok: true, error: null, balance: bal, currency: (j.currency as string) ?? "USD" };
      } catch {
        // try next
      }
    }
    return { ok: false, error: "fal.ai bakiye endpoint'ine erişilemedi", balance: null, currency: null };
  });

export const adminCompleteAiJob = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().min(1), url: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const job = await mysqlOne<{ user_id: string }>("SELECT user_id FROM ai_jobs WHERE id=?", [data.jobId]);
    if (!job) throw new Error("İş bulunamadı");
    await mysqlQuery("UPDATE ai_jobs SET status='completed', result_url=?, error=NULL, updated_at=? WHERE id=?", [
      data.url,
      ts(),
      data.jobId,
    ]);
    await mysqlQuery(
      "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)",
      [crypto.randomUUID(), job.user_id, "ai_job", "AI videon hazır", "Video üretimi tamamlandı, teslim alabilirsin.", "/araclar/video", ts()],
    );
    return { ok: true };
  });

export const adminFailAiJob = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ jobId: z.string().min(1), reason: z.string().min(1).max(500), refund: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const job = await mysqlOne<{ user_id: string; cost_try: unknown; status: string }>(
      "SELECT user_id, cost_try, status FROM ai_jobs WHERE id=?",
      [data.jobId],
    );
    if (!job) throw new Error("İş bulunamadı");
    if (job.status === "completed" || job.status === "refunded") return { ok: true };

    const cost = num(job.cost_try) ?? 0;
    if (data.refund && cost > 0) {
      const wallet = await mysqlOne<{ balance_try: unknown }>("SELECT balance_try FROM wallets WHERE user_id=?", [
        job.user_id,
      ]);
      const newBalance = (num(wallet?.balance_try) ?? 0) + cost;
      await mysqlQuery(
        `INSERT INTO wallets (user_id,balance_try,updated_at) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE balance_try=?, updated_at=VALUES(updated_at)`,
        [job.user_id, newBalance, ts(), newBalance],
      );
      await mysqlQuery(
        "INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
        [crypto.randomUUID(), job.user_id, "refund", cost, newBalance, null, "ai_video_refund", ts()],
      );
      await mysqlQuery("UPDATE ai_jobs SET status='refunded', error=?, updated_at=? WHERE id=?", [
        data.reason,
        ts(),
        data.jobId,
      ]);
    } else {
      await mysqlQuery("UPDATE ai_jobs SET status='failed', error=?, updated_at=? WHERE id=?", [
        data.reason,
        ts(),
        data.jobId,
      ]);
    }

    await mysqlQuery(
      "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)",
      [
        crypto.randomUUID(),
        job.user_id,
        "ai_job",
        data.refund ? "Video iptal — iade edildi" : "Video başarısız",
        data.reason,
        "/araclar/video",
        ts(),
      ],
    );

    return { ok: true };
  });
