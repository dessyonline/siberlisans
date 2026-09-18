import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num } from "./mysql.server";

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const l =
    local.length <= 2
      ? local[0] + "*"
      : local.slice(0, 2) + "*".repeat(Math.max(1, local.length - 3)) + local.slice(-1);
  const [dName, ...dRest] = domain.split(".");
  const d =
    dName.length <= 2
      ? dName[0] + "*"
      : dName[0] + "*".repeat(Math.max(1, dName.length - 2)) + dName.slice(-1);
  return `${l}@${d}${dRest.length ? "." + dRest.join(".") : ""}`;
}

type AffiliateStats = {
  totalEarned: number;
  totalPaid: number;
  pending: number;
  referredCount: number;
  activeReferredCount: number;
};

async function computeAffiliateStats(userId: string): Promise<AffiliateStats> {
  const [earnedRow, paidRow, pendingRow, referredRow, activeRow] = await Promise.all([
    mysqlOne<{ s: unknown }>(
      "SELECT COALESCE(SUM(delta),0) s FROM user_points_ledger WHERE user_id=? AND reason LIKE 'referral%' AND delta>0",
      [userId],
    ),
    mysqlOne<{ s: unknown }>(
      "SELECT COALESCE(SUM(amount_try),0) s FROM affiliate_payouts WHERE user_id=? AND status='paid'",
      [userId],
    ),
    mysqlOne<{ s: unknown }>(
      "SELECT COALESCE(SUM(amount_try),0) s FROM affiliate_payouts WHERE user_id=? AND status IN ('requested','pending','approved')",
      [userId],
    ),
    mysqlOne<{ c: number }>("SELECT COUNT(*) c FROM profiles WHERE referred_by=?", [userId]),
    mysqlOne<{ c: number }>(
      `SELECT COUNT(DISTINCT o.user_id) c FROM orders o JOIN profiles p ON p.id=o.user_id
        WHERE p.referred_by=? AND o.status='approved'`,
      [userId],
    ),
  ]);
  return {
    totalEarned: num(earnedRow?.s) ?? 0,
    totalPaid: num(paidRow?.s) ?? 0,
    pending: num(pendingRow?.s) ?? 0,
    referredCount: Number(referredRow?.c ?? 0),
    activeReferredCount: Number(activeRow?.c ?? 0),
  };
}

export type AffiliatePayoutRow = {
  id: string;
  amount_try: number;
  status: string;
  method: string;
  destination: string | null;
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
};

export type ReferredUserRow = {
  id: string;
  display_name: string | null;
  masked_email: string | null;
  created_at: string;
  referral_bonus_paid: boolean;
};

export const getAffiliateStats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const [stats, payouts, referred] = await Promise.all([
      computeAffiliateStats(userId),
      mysqlQuery<{
        id: string;
        amount_try: unknown;
        status: string;
        method: string;
        destination: string | null;
        admin_note: string | null;
        created_at: string;
        processed_at: string | null;
      }>(
        `SELECT id, amount_try, status, method, destination, admin_note, created_at, processed_at
           FROM affiliate_payouts WHERE user_id=? ORDER BY created_at DESC LIMIT 20`,
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
    ]);

    const payoutRows: AffiliatePayoutRow[] = payouts.map((p) => ({
      id: p.id,
      amount_try: num(p.amount_try) ?? 0,
      status: p.status,
      method: p.method,
      destination: p.destination,
      admin_note: p.admin_note,
      created_at: p.created_at,
      processed_at: p.processed_at,
    }));

    const referredRows: ReferredUserRow[] = referred.map((r) => ({
      id: r.id,
      display_name: r.display_name,
      masked_email: maskEmail(r.email),
      created_at: r.created_at,
      referral_bonus_paid: !!r.referral_bonus_paid,
    }));

    return {
      ...stats,
      payouts: payoutRows,
      referred: referredRows,
    };
  });

export const requestAffiliatePayout = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((v: unknown) => z.object({ amount: z.number().min(50) }).parse(v))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const pendingRow = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM affiliate_payouts WHERE user_id=? AND status IN ('requested','pending','approved')",
      [userId],
    );
    if (Number(pendingRow?.c ?? 0) > 0) {
      throw new Error("Zaten bekleyen bir talebiniz var. Sonuçlanmasını bekleyin.");
    }

    const stats = await computeAffiliateStats(userId);
    const available = stats.totalEarned - stats.totalPaid - stats.pending;
    if (data.amount > available) {
      throw new Error(`Talep tutarı kazancınızdan fazla. Uygun: ${available}`);
    }

    const id = crypto.randomUUID();
    await mysqlQuery(
      `INSERT INTO affiliate_payouts (id,user_id,amount_try,status,method,destination,created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [id, userId, data.amount, "requested", "wallet", "", ts()],
    );
    return { id };
  });
