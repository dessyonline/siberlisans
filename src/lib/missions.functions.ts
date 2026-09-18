import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num } from "./mysql.server";

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

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

async function computeProgress(userId: string, ruleKey: string): Promise<number> {
  if (ruleKey.startsWith("streak_")) {
    const row = await mysqlOne<{ login_streak: number | null }>(
      "SELECT login_streak FROM profiles WHERE id=? LIMIT 1",
      [userId],
    );
    return Number(row?.login_streak ?? 0);
  }
  if (ruleKey === "refer_one") {
    const row = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM profiles WHERE referred_by=?",
      [userId],
    );
    return Number(row?.c ?? 0);
  }
  if (ruleKey === "first_review" || ruleKey === "three_reviews") {
    const row = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM product_reviews WHERE user_id=?",
      [userId],
    );
    return Number(row?.c ?? 0);
  }
  if (ruleKey === "five_favorites") {
    const row = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM favorites WHERE user_id=?",
      [userId],
    );
    return Number(row?.c ?? 0);
  }
  if (ruleKey.startsWith("spend_")) {
    const row = await mysqlOne<{ s: string | null }>(
      "SELECT COALESCE(SUM(price_try),0) s FROM orders WHERE user_id=? AND status='approved'",
      [userId],
    );
    return num(row?.s) ?? 0;
  }
  return 0;
}

export const listMissions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<MissionRow[]> => {
    const userId = context.userId;
    const missions = await mysqlQuery<{
      id: string;
      key: string;
      name: string;
      description: string | null;
      icon: string;
      rule_key: string;
      target: number;
      reward_points: number;
      season: string | null;
    }>(
      `SELECT id, \`key\`, name, description, icon, rule_key, target, reward_points, season
         FROM missions WHERE is_active=1 ORDER BY sort_order ASC`,
    );
    const mine = await mysqlQuery<{
      mission_id: string;
      progress: number;
      completed_at: string | null;
      claimed_at: string | null;
    }>("SELECT mission_id, progress, completed_at, claimed_at FROM user_missions WHERE user_id=?", [userId]);
    const mineMap = new Map(mine.map((r) => [r.mission_id, r]));

    const rows: MissionRow[] = await Promise.all(
      missions.map(async (m) => {
        const computed = await computeProgress(userId, m.rule_key);
        const st = mineMap.get(m.id);
        const progress = Math.max(computed, st?.progress ?? 0);
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
  .middleware([requireAuth])
  .validator((d: { missionId: string }) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const mission = await mysqlOne<{
      id: string;
      rule_key: string;
      target: number;
      reward_points: number;
      is_active: number;
    }>("SELECT id, rule_key, target, reward_points, is_active FROM missions WHERE id=? LIMIT 1", [data.missionId]);
    if (!mission || !mission.is_active) throw new Error("Görev bulunamadı.");

    const existing = await mysqlOne<{ id: string; progress: number; claimed_at: string | null }>(
      "SELECT id, progress, claimed_at FROM user_missions WHERE user_id=? AND mission_id=? LIMIT 1",
      [userId, mission.id],
    );
    if (existing?.claimed_at) throw new Error("Bu görev zaten alındı.");

    const computed = await computeProgress(userId, mission.rule_key);
    const progress = Math.max(computed, existing?.progress ?? 0);
    if (progress < mission.target) throw new Error("Görev henüz tamamlanmadı.");

    const now = ts();
    if (existing) {
      await mysqlQuery(
        "UPDATE user_missions SET progress=?, completed_at=COALESCE(completed_at,?), claimed_at=? WHERE id=?",
        [progress, now, now, existing.id],
      );
    } else {
      await mysqlQuery(
        `INSERT INTO user_missions (id,user_id,mission_id,progress,completed_at,claimed_at,created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), userId, mission.id, progress, now, now, now],
      );
    }

    await mysqlQuery("UPDATE profiles SET total_points=COALESCE(total_points,0)+? WHERE id=?", [
      mission.reward_points,
      userId,
    ]);
    const prof = await mysqlOne<{ total_points: number | null }>(
      "SELECT total_points FROM profiles WHERE id=?",
      [userId],
    );
    await mysqlQuery(
      `INSERT INTO user_points_ledger (id,user_id,delta,reason,balance_after,created_at)
       VALUES (?,?,?,?,?,?)`,
      [crypto.randomUUID(), userId, mission.reward_points, `mission:${mission.id}`, prof?.total_points ?? 0, now],
    );
    await mysqlQuery(
      `INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        userId,
        "mission_reward",
        "Görev tamamlandı ✓",
        `+${mission.reward_points} puan kazandın`,
        "/hesabim",
        now,
      ],
    ).catch(() => undefined);

    return { awarded: mission.reward_points, progress, target: mission.target };
  });

const POINTS_TO_TRY = 100; // 100 puan = ₺1

export const redeemPointsForCoupon = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: { points: number }) =>
    z.object({ points: z.union([z.literal(500), z.literal(1000), z.literal(2000)]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const prof = await mysqlOne<{ total_points: number | null }>(
      "SELECT total_points FROM profiles WHERE id=? LIMIT 1",
      [userId],
    );
    const balance = Number(prof?.total_points ?? 0);
    if (balance < data.points) throw new Error("Yetersiz puan.");

    const discountTry = Math.round((data.points / POINTS_TO_TRY) * 100) / 100;
    const now = ts();
    const code = `PUAN${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const expires = ts(new Date(Date.now() + 30 * 86400_000));

    await mysqlQuery("UPDATE profiles SET total_points=total_points-? WHERE id=? AND total_points>=?", [
      data.points,
      userId,
      data.points,
    ]);
    const after = await mysqlOne<{ total_points: number | null }>(
      "SELECT total_points FROM profiles WHERE id=?",
      [userId],
    );
    await mysqlQuery(
      `INSERT INTO user_points_ledger (id,user_id,delta,reason,balance_after,created_at) VALUES (?,?,?,?,?,?)`,
      [crypto.randomUUID(), userId, -data.points, "redeem_coupon", after?.total_points ?? 0, now],
    );
    await mysqlQuery(
      `INSERT INTO coupons (id,code,discount_type,discount_value,min_order_try,max_uses,used_count,expires_at,is_active,created_at,updated_at,user_id,is_personal)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), code, "amount", discountTry, 0, 1, 0, expires, 1, now, now, userId, 1],
    );

    return { coupon_code: code, discount_try: discountTry };
  });

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const l = local.length <= 2 ? local[0] + "*" : local.slice(0, 2) + "*".repeat(Math.max(1, local.length - 3)) + local.slice(-1);
  const [dName, ...dRest] = domain.split(".");
  const d = dName.length <= 2 ? dName[0] + "*" : dName[0] + "*".repeat(Math.max(1, dName.length - 2)) + dName.slice(-1);
  return `${l}@${d}${dRest.length ? "." + dRest.join(".") : ""}`;
}

// Public leaderboard - no auth required. Based on current-month positive point gains.
export const getMonthlyLeaderboard = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await mysqlQuery<{
    user_id: string;
    points_earned: string | number;
    email: string | null;
    display_name: string | null;
    tier: string | null;
    avatar_id: string | null;
  }>(
    `SELECT l.user_id, SUM(l.delta) points_earned, p.email, p.display_name, p.tier, p.avatar_id
       FROM user_points_ledger l
       JOIN profiles p ON p.id = l.user_id
      WHERE l.delta > 0 AND l.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
      GROUP BY l.user_id, p.email, p.display_name, p.tier, p.avatar_id
      ORDER BY points_earned DESC
      LIMIT 20`,
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    user_id: r.user_id,
    display_masked: maskEmail(r.email) ?? r.display_name ?? "Anonim",
    tier: r.tier ?? "bronze",
    points_earned: Number(r.points_earned) || 0,
    avatar_id: r.avatar_id,
  }));
});
