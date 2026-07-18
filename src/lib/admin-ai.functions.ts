import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("forbidden");
}

export const listAdminAiJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.enum(["all", "queued", "processing", "completed", "failed"]).default("all"),
      search: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    let q = supabase
      .from("ai_jobs")
      .select("id,user_id,kind,prompt,params,cost_try,status,result_url,error,created_at,provider,provider_model")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search && data.search.trim()) q = q.ilike("prompt", `%${data.search.trim()}%`);

    const { data: jobs, error } = await q;
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((jobs ?? []).map((j: any) => j.user_id).filter(Boolean)));
    let userMap: Record<string, { email: string | null; display_name: string | null; tier: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,email,display_name,tier")
        .in("id", userIds);
      for (const p of profs ?? []) {
        userMap[p.id] = { email: p.email, display_name: p.display_name, tier: p.tier };
      }
    }

    return (jobs ?? []).map((j: any) => ({ ...j, user: userMap[j.user_id] ?? null }));
  });

export const getAdminAiStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const [{ data: jobs }, { data: usage }, { data: subs }] = await Promise.all([
      supabase.from("ai_jobs").select("status,cost_try,kind,user_id,created_at").gte("created_at", since),
      supabase.from("ai_tool_usage").select("tool_key,count,user_id,day").gte("day", since.slice(0, 10)),
      supabase.from("ai_subscriptions").select("plan_slug,status,price_paid,credits_total,credits_remaining,user_id").eq("status", "active"),
    ]);

    const j = jobs ?? [];
    const totalJobs = j.length;
    const totalCost = j.reduce((s: number, r: any) => s + Number(r.cost_try ?? 0), 0);
    const byStatus: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    const userJobs: Record<string, number> = {};
    for (const r of j) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
      userJobs[r.user_id] = (userJobs[r.user_id] ?? 0) + 1;
    }

    const byTool: Record<string, number> = {};
    const userTool: Record<string, number> = {};
    for (const r of usage ?? []) {
      byTool[r.tool_key] = (byTool[r.tool_key] ?? 0) + Number(r.count ?? 0);
      userTool[r.user_id] = (userTool[r.user_id] ?? 0) + Number(r.count ?? 0);
    }

    // top users combined
    const combined: Record<string, number> = { ...userJobs };
    for (const [uid, c] of Object.entries(userTool)) combined[uid] = (combined[uid] ?? 0) + c;
    const topIds = Object.entries(combined).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
    let topUsers: Array<{ id: string; email: string | null; display_name: string | null; jobs: number; tool_calls: number }> = [];
    if (topIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id,email,display_name").in("id", topIds);
      const pm: Record<string, any> = {};
      for (const p of profs ?? []) pm[p.id] = p;
      topUsers = topIds.map((id) => ({
        id,
        email: pm[id]?.email ?? null,
        display_name: pm[id]?.display_name ?? null,
        jobs: userJobs[id] ?? 0,
        tool_calls: userTool[id] ?? 0,
      }));
    }

    const activeSubs = (subs ?? []).length;
    const subsByPlan: Record<string, number> = {};
    let subRevenue = 0;
    for (const s of subs ?? []) {
      subsByPlan[s.plan_slug] = (subsByPlan[s.plan_slug] ?? 0) + 1;
      subRevenue += Number(s.price_paid ?? 0);
    }

    return {
      totalJobs,
      totalCost,
      byStatus,
      byKind,
      byTool,
      topUsers,
      activeSubs,
      subsByPlan,
      subRevenue,
    };
  });
