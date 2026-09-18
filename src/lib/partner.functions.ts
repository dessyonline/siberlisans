import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num } from "./mysql.server";

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export type PartnerDailyStat = { d: string; clicks: number; earn: number };

export const getPartnerStats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const [totalRow, d30Row, convRow, earnRow, clicksDaily, earnDaily] = await Promise.all([
      mysqlOne<{ c: number }>("SELECT COUNT(*) c FROM referral_clicks WHERE partner_user_id=?", [userId]),
      mysqlOne<{ c: number }>(
        "SELECT COUNT(*) c FROM referral_clicks WHERE partner_user_id=? AND created_at > (NOW() - INTERVAL 30 DAY)",
        [userId],
      ),
      mysqlOne<{ c: number }>(
        "SELECT COUNT(*) c FROM referral_clicks WHERE partner_user_id=? AND converted=1",
        [userId],
      ),
      mysqlOne<{ s: unknown }>(
        `SELECT COALESCE(SUM(amount_try),0) s FROM wallet_transactions
           WHERE user_id=? AND kind='referral_bonus' AND created_at > (NOW() - INTERVAL 30 DAY)`,
        [userId],
      ),
      mysqlQuery<{ d: string; c: number }>(
        `SELECT DATE(created_at) d, COUNT(*) c FROM referral_clicks
           WHERE partner_user_id=? AND created_at > (NOW() - INTERVAL 30 DAY)
           GROUP BY DATE(created_at)`,
        [userId],
      ),
      mysqlQuery<{ d: string; s: unknown }>(
        `SELECT DATE(created_at) d, COALESCE(SUM(amount_try),0) s FROM wallet_transactions
           WHERE user_id=? AND kind='referral_bonus' AND created_at > (NOW() - INTERVAL 30 DAY)
           GROUP BY DATE(created_at)`,
        [userId],
      ),
    ]);

    const clicksMap = new Map(clicksDaily.map((r) => [r.d, Number(r.c)]));
    const earnMap = new Map(earnDaily.map((r) => [r.d, num(r.s) ?? 0]));
    const daily: PartnerDailyStat[] = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      daily.push({ d: key, clicks: clicksMap.get(key) ?? 0, earn: earnMap.get(key) ?? 0 });
    }

    const total = Number(totalRow?.c ?? 0);
    const conv = Number(convRow?.c ?? 0);

    return {
      clicksTotal: total,
      clicks30d: Number(d30Row?.c ?? 0),
      conversions: conv,
      conversionRate: total > 0 ? Math.round((conv / total) * 1000) / 10 : 0,
      earnings30d: num(earnRow?.s) ?? 0,
      daily,
    };
  });

export const updatePartnerSlug = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        slug: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9_-]{3,24}$/, "3-24 karakter · sadece harf, rakam, - _"),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const existing = await mysqlOne<{ id: string }>(
      "SELECT id FROM profiles WHERE partner_slug=? AND id<>? LIMIT 1",
      [data.slug, context.userId],
    );
    if (existing) throw new Error("Bu kullanıcı adı alınmış");
    await mysqlQuery("UPDATE profiles SET partner_slug=? WHERE id=?", [data.slug, context.userId]);
    return { slug: data.slug };
  });

export const recordReferralClick = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z
      .object({
        code: z.string().min(3).max(48),
        source: z.string().max(120).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data }) => {
    const code = data.code.trim();
    const partner = await mysqlOne<{ id: string }>(
      "SELECT id FROM profiles WHERE referral_code=? OR partner_slug=? LIMIT 1",
      [code.toUpperCase(), code.toLowerCase()],
    );
    if (!partner) return { id: null };
    const id = crypto.randomUUID();
    await mysqlQuery(
      `INSERT INTO referral_clicks (id,referral_code,partner_user_id,source,converted,created_at)
       VALUES (?,?,?,?,0,?)`,
      [id, code.toUpperCase(), partner.id, (data.source ?? "").slice(0, 120), ts()],
    );
    return { id };
  });

export const getPartnerLanding = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => z.object({ code: z.string().min(3).max(48) }).parse(v))
  .handler(async ({ data }) => {
    const code = data.code.trim();
    const p = await mysqlOne<{ display_name: string | null; referral_code: string }>(
      "SELECT display_name, referral_code FROM profiles WHERE referral_code=? OR partner_slug=? LIMIT 1",
      [code.toUpperCase(), code.toLowerCase()],
    );
    if (!p) return { found: false as const };
    return {
      found: true as const,
      partnerName: p.display_name ?? "SiberPHP Partner",
      code: p.referral_code,
    };
  });

/* ================= ADMIN PAYOUTS ================= */

export type AdminPayoutRow = {
  id: string;
  user_id: string;
  amount_try: number;
  status: "requested" | "approved" | "rejected" | "paid";
  method: string;
  destination: string;
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
  user: { display_name: string | null; email: string | null } | null;
};

export const adminListPayouts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminPayoutRow[]> => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const rows = await mysqlQuery<Record<string, unknown>>(
      `SELECT p.id, p.user_id, p.amount_try, p.status, p.method, p.destination, p.admin_note,
              p.created_at, p.processed_at, pr.display_name, pr.email
         FROM affiliate_payouts p
         LEFT JOIN profiles pr ON pr.id = p.user_id
        ORDER BY p.created_at DESC
        LIMIT 200`,
    );
    return rows.map((r) => ({
      id: String(r.id),
      user_id: String(r.user_id),
      amount_try: num(r.amount_try) ?? 0,
      status: r.status as AdminPayoutRow["status"],
      method: String(r.method ?? ""),
      destination: String(r.destination ?? ""),
      admin_note: (r.admin_note as string | null) ?? null,
      created_at: String(r.created_at),
      processed_at: (r.processed_at as string | null) ?? null,
      user: r.display_name !== undefined || r.email !== undefined
        ? { display_name: (r.display_name as string | null) ?? null, email: (r.email as string | null) ?? null }
        : null,
    }));
  });

const setPayoutInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "paid"]),
  note: z.string().max(500).optional(),
});

export const adminSetPayoutStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => setPayoutInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const row = await mysqlOne<{ id: string; user_id: string; amount_try: unknown; status: string }>(
      "SELECT id, user_id, amount_try, status FROM affiliate_payouts WHERE id=? LIMIT 1",
      [data.id],
    );
    if (!row) throw new Error("Bulunamadı");

    if (data.status === "rejected" && row.status === "requested") {
      const w = await mysqlOne<{ balance_try: unknown }>(
        "SELECT balance_try FROM wallets WHERE user_id=? LIMIT 1",
        [row.user_id],
      );
      const amount = num(row.amount_try) ?? 0;
      const bal = (num(w?.balance_try) ?? 0) + amount;
      await mysqlQuery(
        `INSERT INTO wallets (user_id,balance_try,updated_at) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE balance_try=VALUES(balance_try), updated_at=VALUES(updated_at)`,
        [row.user_id, bal, ts()],
      );
      await mysqlQuery(
        `INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,note,created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), row.user_id, "refund", amount, bal, "Partner ödeme talebi reddi - iade", ts()],
      );
    }

    await mysqlQuery(
      "UPDATE affiliate_payouts SET status=?, admin_note=?, processed_at=? WHERE id=?",
      [data.status, data.note ?? null, ts(), data.id],
    );
    return { ok: true };
  });

/* ================= REFERRAL INFO (davet.tsx) ================= */

export type ReferredUserRow = {
  id: string;
  display_name: string | null;
  masked_email: string | null;
  created_at: string;
  referral_bonus_paid: boolean;
};

export type ReferralInfo = {
  code: string | null;
  slug: string | null;
  displayName: string | null;
  invited: ReferredUserRow[];
  totalBonus: number;
};

function maskEmailForReferral(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return null;
  const l = local.length <= 2 ? local.slice(0, 1) + "*" : local.slice(0, 2) + "*".repeat(Math.max(1, local.length - 2));
  return `${l}@${domain}`;
}

export const getReferralInfo = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<ReferralInfo> => {
    const userId = context.userId;
    const [profile, invited, bonusRow] = await Promise.all([
      mysqlOne<{ referral_code: string | null; partner_slug: string | null; display_name: string | null }>(
        "SELECT referral_code, partner_slug, display_name FROM profiles WHERE id=? LIMIT 1",
        [userId],
      ),
      mysqlQuery<{
        id: string;
        display_name: string | null;
        email: string | null;
        created_at: string;
        referral_bonus_paid: number | null;
      }>(
        `SELECT id, display_name, email, created_at, referral_bonus_paid
           FROM profiles WHERE referred_by=? ORDER BY created_at DESC LIMIT 200`,
        [userId],
      ),
      mysqlOne<{ s: unknown }>(
        "SELECT COALESCE(SUM(amount_try),0) s FROM wallet_transactions WHERE user_id=? AND kind='referral_bonus'",
        [userId],
      ),
    ]);
    return {
      code: profile?.referral_code ?? null,
      slug: profile?.partner_slug ?? null,
      displayName: profile?.display_name ?? null,
      invited: invited.map((u) => ({
        id: u.id,
        display_name: u.display_name,
        masked_email: maskEmailForReferral(u.email),
        created_at: u.created_at,
        referral_bonus_paid: u.referral_bonus_paid === 1,
      })),
      totalBonus: num(bonusRow?.s) ?? 0,
    };
  });
