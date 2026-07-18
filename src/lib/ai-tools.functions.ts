import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ToolKey = "chat" | "translate" | "code" | "summary" | "slogan";
export const TOOL_KEYS: ToolKey[] = ["chat", "translate", "code", "summary", "slogan"];

export const getToolQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: prof }, { data: usage }] = await Promise.all([
      supabase.from("profiles").select("tier, total_points").eq("id", userId).maybeSingle(),
      supabase.from("ai_tool_usage").select("tool_key, count").eq("user_id", userId).eq("day", today),
    ]);
    const tier = (prof?.tier ?? "bronze").toLowerCase();
    const limit =
      tier === "platinum" ? 150 : tier === "gold" ? 60 : tier === "silver" ? 25 : 10;
    const used: Record<string, number> = {};
    for (const row of usage ?? []) used[row.tool_key] = row.count;
    return {
      tier,
      limit,
      points: prof?.total_points ?? 0,
      used,
    };
  });

export const createAiVideoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const { supabase } = context;
    const { data: jobId, error } = await supabase.rpc("create_ai_video_job", {
      _prompt: data.prompt,
      _duration: data.duration,
      _aspect: data.aspect,
      _quality: data.quality,
    });
    if (error) throw new Error(error.message);
    return { jobId: jobId as string };
  });

export const getAiVideoPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("ai_video_prices");
    if (error) throw new Error(error.message);
    const map: Record<string, Record<number, number>> = {
      fast: { 5: 10, 10: 20 },
      hd: { 5: 25, 10: 50 },
      cinematic: { 5: 50, 10: 100 },
    };
    (data ?? []).forEach((r: { quality: string; duration: number; cost_try: number }) => {
      if (!map[r.quality]) map[r.quality] = {};
      map[r.quality][r.duration] = Number(r.cost_try);
    });
    return map;
  });

export const listMyAiJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("ai_jobs")
      .select("id, kind, prompt, params, cost_try, status, result_url, error, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
