import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num } from "./mysql.server";

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export type Badge = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  rule_key: string;
  threshold: number | null;
  earned: boolean;
};

export type MyBadges = {
  badges: Badge[];
  streak: number;
  lastStreakAt: string | null;
  totalPoints: number;
};

export const listMyBadges = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<MyBadges> => {
    const userId = context.userId;
    const [allBadges, mine, profile] = await Promise.all([
      mysqlQuery<{ id: string; name: string; description: string | null; icon: string; rule_key: string; threshold: unknown }>(
        "SELECT id, name, description, icon, rule_key, threshold FROM badges",
      ),
      mysqlQuery<{ badge_id: string }>("SELECT badge_id FROM user_badges WHERE user_id=?", [userId]),
      mysqlOne<{ login_streak: number | null; last_streak_at: string | null; total_points: unknown }>(
        "SELECT login_streak, last_streak_at, total_points FROM profiles WHERE id=?",
        [userId],
      ),
    ]);
    const earned = new Set(mine.map((b) => b.badge_id));
    return {
      badges: allBadges.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        icon: b.icon,
        rule_key: b.rule_key,
        threshold: num(b.threshold),
        earned: earned.has(b.id),
      })),
      streak: profile?.login_streak ?? 0,
      lastStreakAt: profile?.last_streak_at ?? null,
      totalPoints: num(profile?.total_points) ?? 0,
    };
  });

export const bumpStreak = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ streak: number; bonus: number }> => {
    const userId = context.userId;
    const row = await mysqlOne<{ last_streak_at: string | null; login_streak: number | null }>(
      "SELECT last_streak_at, login_streak FROM profiles WHERE id=?",
      [userId],
    );
    const last = row?.last_streak_at ? row.last_streak_at.slice(0, 10) : null;
    let cur = row?.login_streak ?? 0;
    const now = today();

    if (last === now) {
      return { streak: cur, bonus: 0 };
    }
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    if (last === yesterday) {
      cur = cur + 1;
    } else {
      cur = 1;
    }
    const bonus = cur % 7 === 0 ? 20 : cur % 3 === 0 ? 5 : 1;

    await mysqlQuery(
      "UPDATE profiles SET login_streak=?, last_streak_at=?, total_points=COALESCE(total_points,0)+? WHERE id=?",
      [cur, now, bonus, userId],
    );
    const prof = await mysqlOne<{ total_points: unknown }>("SELECT total_points FROM profiles WHERE id=?", [userId]);
    await mysqlQuery(
      "INSERT INTO user_points_ledger (id,user_id,delta,reason,balance_after,created_at) VALUES (?,?,?,?,?,?)",
      [crypto.randomUUID(), userId, bonus, `streak_day_${cur}`, num(prof?.total_points) ?? 0, ts()],
    );
    return { streak: cur, bonus };
  });
