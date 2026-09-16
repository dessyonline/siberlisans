import { createServerFn } from "@tanstack/react-start";
import { requireAuth, requireAdmin } from "./auth-middleware.server";

export type WalletSummary = {
  balance: number;
  updatedAt: string | null;
  topups: Array<{
    id: string;
    reference_code: string | null;
    amount_try: number;
    status: string;
    created_at: string | null;
    admin_note: string | null;
  }>;
  txns: Array<{
    id: string;
    kind: string;
    amount_try: number;
    balance_after: number;
    note: string | null;
    created_at: string | null;
  }>;
};

export const getMyWallet = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<WalletSummary> => {
    const { mysqlQuery, mysqlOne, num } = await import("./mysql.server");
    const userId = context.userId;

    const w = await mysqlOne<{ balance_try: unknown; updated_at: string | null }>(
      "SELECT balance_try, updated_at FROM wallets WHERE user_id=? LIMIT 1",
      [userId],
    );
    const topups = await mysqlQuery<{
      id: string;
      reference_code: string | null;
      amount_try: unknown;
      status: string;
      created_at: string | null;
      admin_note: string | null;
    }>(
      `SELECT id, reference_code, amount_try, status, created_at, admin_note
         FROM wallet_topups WHERE user_id=? ORDER BY created_at DESC LIMIT 30`,
      [userId],
    );
    const txns = await mysqlQuery<{
      id: string;
      kind: string;
      amount_try: unknown;
      balance_after: unknown;
      note: string | null;
      created_at: string | null;
    }>(
      `SELECT id, kind, amount_try, balance_after, note, created_at
         FROM wallet_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 30`,
      [userId],
    );

    return {
      balance: num(w?.balance_try) ?? 0,
      updatedAt: w?.updated_at ?? null,
      topups: topups.map((t) => ({ ...t, amount_try: num(t.amount_try) ?? 0 })),
      txns: txns.map((t) => ({
        ...t,
        amount_try: num(t.amount_try) ?? 0,
        balance_after: num(t.balance_after) ?? 0,
      })),
    };
  });

export const getTopup = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) => {
    const o = d as { topupId?: string };
    if (!o?.topupId) throw new Error("topupId gerekli");
    return { topupId: o.topupId };
  })
  .handler(async ({ data, context }) => {
    const { mysqlOne, num } = await import("./mysql.server");
    const t = await mysqlOne<{
      id: string;
      reference_code: string | null;
      amount_try: unknown;
      status: string;
      created_at: string | null;
      admin_note: string | null;
      receipt_path: string | null;
    }>(
      `SELECT id, reference_code, amount_try, status, created_at, admin_note, receipt_path
         FROM wallet_topups WHERE id=? AND user_id=? LIMIT 1`,
      [data.topupId, context.userId],
    );
    if (!t) return null;
    return { ...t, amount_try: num(t.amount_try) ?? 0 };
  });

export const adminListTopups = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { mysqlQuery, num } = await import("./mysql.server");
    const rows = await mysqlQuery<{
      id: string;
      user_id: string;
      reference_code: string | null;
      amount_try: unknown;
      status: string;
      created_at: string | null;
      receipt_path: string | null;
      user_note: string | null;
      admin_note: string | null;
      is_vpn: unknown;
      ip_country: string | null;
      client_ip: string | null;
      email: string | null;
      display_name: string | null;
    }>(
      `SELECT t.id, t.user_id, t.reference_code, t.amount_try, t.status, t.created_at,
              t.receipt_path, t.user_note, t.admin_note, t.is_vpn, t.ip_country, t.client_ip,
              p.email, p.display_name
         FROM wallet_topups t
         LEFT JOIN profiles p ON p.id = t.user_id
        ORDER BY t.created_at DESC
        LIMIT 200`,
    );
    return rows.map((r) => ({
      ...r,
      amount_try: num(r.amount_try) ?? 0,
      is_vpn: Number(r.is_vpn ?? 0) === 1,
    }));
  });

export const adminListWallets = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { mysqlQuery, num } = await import("./mysql.server");
    const rows = await mysqlQuery<{
      user_id: string;
      balance_try: unknown;
      updated_at: string | null;
      email: string | null;
      display_name: string | null;
    }>(
      `SELECT w.user_id, w.balance_try, w.updated_at, p.email, p.display_name
         FROM wallets w
         LEFT JOIN profiles p ON p.id = w.user_id
        WHERE w.balance_try > 0
        ORDER BY w.balance_try DESC
        LIMIT 200`,
    );
    return rows.map((r) => ({ ...r, balance_try: num(r.balance_try) ?? 0 }));
  });
