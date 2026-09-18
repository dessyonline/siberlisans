import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./auth-middleware.server";
import { mysqlQuery, bool } from "./mysql.server";

export type CrossSellRule = {
  id: string;
  from_category: string;
  to_category: string;
  discount_percent: number;
  promo_code: string | null;
  note: string | null;
  active: boolean;
};

export const listCrossSellRules = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<CrossSellRule[]> => {
    const rows = await mysqlQuery<{
      id: string;
      from_category: string;
      to_category: string;
      discount_percent: number;
      promo_code: string | null;
      note: string | null;
      active: number;
    }>("SELECT id, from_category, to_category, discount_percent, promo_code, note, active FROM cross_sell_rules ORDER BY created_at DESC");
    return rows.map((r) => ({
      id: r.id,
      from_category: r.from_category,
      to_category: r.to_category,
      discount_percent: Number(r.discount_percent),
      promo_code: r.promo_code,
      note: r.note,
      active: bool(r.active),
    }));
  });

export const listProductCategories = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<string[]> => {
    const rows = await mysqlQuery<{ category: string | null }>(
      "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND active = 1",
    );
    return Array.from(new Set(rows.map((r) => r.category).filter((c): c is string => !!c))).sort();
  });

const createInput = z.object({
  from_category: z.string().min(1),
  to_category: z.string().min(1),
  discount_percent: z.number().min(1).max(90),
  promo_code: z.string().max(40).nullable().optional(),
  note: z.string().max(200).nullable().optional(),
  active: z.boolean(),
});

export const createCrossSellRule = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data }) => {
    if (data.from_category === data.to_category) throw new Error("Aynı kategori seçilemez");
    await mysqlQuery(
      "INSERT INTO cross_sell_rules (id, from_category, to_category, discount_percent, promo_code, note, active, created_at) VALUES (?,?,?,?,?,?,?,NOW())",
      [crypto.randomUUID(), data.from_category, data.to_category, data.discount_percent, data.promo_code ?? null, data.note ?? null, data.active],
    );
    return { ok: true };
  });

const toggleInput = z.object({ id: z.string().uuid(), active: z.boolean() });

export const toggleCrossSellRule = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => toggleInput.parse(d))
  .handler(async ({ data }) => {
    await mysqlQuery("UPDATE cross_sell_rules SET active=? WHERE id=?", [data.active, data.id]);
    return { ok: true };
  });

const deleteInput = z.object({ id: z.string().uuid() });

export const deleteCrossSellRule = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data }) => {
    await mysqlQuery("DELETE FROM cross_sell_rules WHERE id=?", [data.id]);
    return { ok: true };
  });
