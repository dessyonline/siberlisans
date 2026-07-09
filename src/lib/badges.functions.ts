import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMyBadges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [allB, mine, profile] = await Promise.all([
      supabase.from("badges").select("id, name, description, icon, rule_key, threshold"),
      supabase.from("user_badges").select("badge_id, earned_at").eq("user_id", userId),
      supabase.from("profiles").select("login_streak, last_streak_at, total_points").eq("id", userId).maybeSingle(),
    ]);
    const earned = new Set((mine.data ?? []).map((b) => b.badge_id));
    return {
      badges: (allB.data ?? []).map((b) => ({ ...b, earned: earned.has(b.id) })),
      streak: profile.data?.login_streak ?? 0,
      lastStreakAt: profile.data?.last_streak_at ?? null,
      totalPoints: profile.data?.total_points ?? 0,
    };
  });

export const bumpStreak = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("bump_login_streak");
    if (error) throw new Error(error.message);
    const row = data?.[0] ?? { streak: 0, bonus_points: 0 };
    return { streak: row.streak, bonus: row.bonus_points };
  });
