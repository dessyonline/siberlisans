import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

export type MissionRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string;
  rule_key: string;
  target: number;
  reward_points: number;
  season: string | null;
  progress: number;
  completed: boolean;
  claimed: boolean;
};

export const listMissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [missionsRes, mineRes] = await Promise.all([
      supabase
        .from("missions" as never)
        .select("id, key, name, description, icon, rule_key, target, reward_points, season, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("user_missions" as never)
        .select("mission_id, progress, completed_at, claimed_at")
        .eq("user_id", userId),
    ]);

    type M = {
      id: string;
      key: string;
      name: string;
      description: string | null;
      icon: string;
      rule_key: string;
      target: number;
      reward_points: number;
      season: string | null;
    };
    const missions = ((missionsRes.data as unknown as M[]) ?? []);
    const mine = new Map<string, { progress: number; completed_at: string | null; claimed_at: string | null }>();
    for (const r of (mineRes.data as unknown as Array<{ mission_id: string; progress: number; completed_at: string | null; claimed_at: string | null }> ?? [])) {
      mine.set(r.mission_id, { progress: r.progress, completed_at: r.completed_at, claimed_at: r.claimed_at });
    }

    // Fresh progress computed on the fly
    const rows: MissionRow[] = await Promise.all(
      missions.map(async (m) => {
        const { data } = await supabase.rpc("compute_mission_progress" as never, {
          _user_id: userId,
          _rule_key: m.rule_key,
        } as never);
        const st = mine.get(m.id);
        const progress = Math.max(Number(data ?? 0), st?.progress ?? 0);
        return {
          id: m.id,
          key: m.key,
          name: m.name,
          description: m.description,
          icon: m.icon,
          rule_key: m.rule_key,
          target: m.target,
          reward_points: m.reward_points,
          season: m.season,
          progress,
          completed: progress >= m.target,
          claimed: !!st?.claimed_at,
        };
      }),
    );
    return rows;
  });

export const claimMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { missionId: string }) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("claim_mission" as never, {
      _mission_id: data.missionId,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(r) ? r[0] : r;
    return row as { awarded: number; progress: number; target: number };
  });

export const redeemPointsForCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { points: number }) =>
    z.object({ points: z.union([z.literal(500), z.literal(1000), z.literal(2000)]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("redeem_points_for_coupon" as never, {
      _points: data.points,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(r) ? r[0] : r;
    return row as { coupon_code: string; discount_try: number };
  });

// Public leaderboard - no auth required
export const getMonthlyLeaderboard = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.rpc("monthly_leaderboard" as never);
  if (error) throw new Error(error.message);
  return (data as unknown as Array<{
    rank: number;
    user_id: string;
    display_masked: string;
    tier: string;
    points_earned: number;
    avatar_id: string | null;
  }>) ?? [];
});
