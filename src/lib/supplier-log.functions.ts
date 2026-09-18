import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/auth-middleware.server";
import { mysqlQuery, bool, num } from "@/lib/mysql.server";

export type SupplierCheckLogRow = {
  id: string;
  created_at: string;
  source: string;
  product_name: string | null;
  external_id: string | null;
  stock_ok: boolean | null;
  stock_count: number | null;
  is_stock: boolean | null;
  supplier_amount: number | null;
  balance: number | null;
  balance_ok: boolean | null;
  blocked: boolean;
  block_reason: string | null;
  context: string | null;
  error: string | null;
};

export const listSupplierCheckLogs = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<SupplierCheckLogRow[]> => {
    const rows = await mysqlQuery<Record<string, unknown>>(
      `SELECT id, created_at, source, product_name, external_id, stock_ok, stock_count, is_stock,
              supplier_amount, balance, balance_ok, blocked, block_reason, context, error
         FROM supplier_check_logs
        ORDER BY created_at DESC
        LIMIT 200`,
    );
    return rows.map((r) => ({
      id: String(r.id),
      created_at: String(r.created_at),
      source: String(r.source ?? ""),
      product_name: (r.product_name as string | null) ?? null,
      external_id: (r.external_id as string | null) ?? null,
      stock_ok: r.stock_ok === null || r.stock_ok === undefined ? null : bool(r.stock_ok),
      stock_count: r.stock_count === null || r.stock_count === undefined ? null : Number(r.stock_count),
      is_stock: r.is_stock === null || r.is_stock === undefined ? null : bool(r.is_stock),
      supplier_amount: num(r.supplier_amount),
      balance: num(r.balance),
      balance_ok: r.balance_ok === null || r.balance_ok === undefined ? null : bool(r.balance_ok),
      blocked: bool(r.blocked),
      block_reason: (r.block_reason as string | null) ?? null,
      context: (r.context as string | null) ?? null,
      error: (r.error as string | null) ?? null,
    }));
  });
