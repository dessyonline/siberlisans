import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-middleware.server";
import { mysqlQuery, num } from "@/lib/mysql.server";

export type SearchOrderRow = { id: string; ref: string; status: string; price: number; email: string | null; created_at: string };
export type SearchUserRow = { id: string; email: string | null; display_name: string | null; created_at: string };
export type SearchProductRow = { id: string; name: string; slug: string; active: boolean };

export const adminGlobalSearch = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ q: z.string().min(2).max(120) }).parse(d))
  .handler(async ({ data }): Promise<{ orders: SearchOrderRow[]; users: SearchUserRow[]; products: SearchProductRow[] }> => {
    const like = `%${data.q}%`;
    const [orders, users, products] = await Promise.all([
      mysqlQuery<Record<string, unknown>>(
        `SELECT o.id, o.reference_code, o.status, o.price_try, o.created_at, pr.email
           FROM orders o LEFT JOIN profiles pr ON pr.id = o.user_id
          WHERE o.reference_code LIKE ?
          ORDER BY o.created_at DESC LIMIT 6`,
        [like],
      ),
      mysqlQuery<Record<string, unknown>>(
        `SELECT id, email, display_name, created_at FROM profiles
          WHERE email LIKE ? OR display_name LIKE ?
          ORDER BY created_at DESC LIMIT 6`,
        [like, like],
      ),
      mysqlQuery<Record<string, unknown>>(
        `SELECT id, name, slug, active FROM products
          WHERE name LIKE ? OR slug LIKE ?
          LIMIT 6`,
        [like, like],
      ),
    ]);
    return {
      orders: orders.map((o) => ({
        id: String(o.id),
        ref: String(o.reference_code),
        status: String(o.status),
        price: num(o.price_try) ?? 0,
        email: (o.email as string | null) ?? null,
        created_at: String(o.created_at),
      })),
      users: users.map((u) => ({
        id: String(u.id),
        email: (u.email as string | null) ?? null,
        display_name: (u.display_name as string | null) ?? null,
        created_at: String(u.created_at),
      })),
      products: products.map((p) => ({
        id: String(p.id),
        name: String(p.name),
        slug: String(p.slug),
        active: !!Number(p.active ?? 0),
      })),
    };
  });
