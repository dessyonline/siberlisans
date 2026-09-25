import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./auth-middleware.server";
import { bool, mysqlQuery, num } from "./mysql.server";

export const listAdminProducts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const rows = await mysqlQuery<Record<string, unknown>>(
      `SELECT p.*,
              COALESCE(k.available_count,0) available_count,
              COALESCE(k.total_count,0) total_count
         FROM products p
         LEFT JOIN (
           SELECT product_id, COUNT(*) total_count,
                  SUM(status='available') available_count
             FROM license_keys GROUP BY product_id
         ) k ON k.product_id=p.id
        ORDER BY p.sort_order DESC, p.created_at DESC`,
    );
    return rows.map((p) => ({
      ...p,
      id: String(p.id), name: String(p.name), slug: String(p.slug),
      description: (p.description as string | null) ?? null,
      duration: String(p.duration ?? "monthly"), delivery_type: String(p.delivery_type ?? "key"),
      price_try: num(p.price_try) ?? 0, cost_try: num(p.cost_try), active: bool(p.active),
      category: (p.category as string | null) ?? null, manual_fulfillment: bool(p.manual_fulfillment),
      stock_hint: num(p.stock_hint), low_stock_threshold: num(p.low_stock_threshold) ?? 5,
      featured: bool(p.featured), unlimited_stock: bool(p.unlimited_stock), sort_order: num(p.sort_order) ?? 0,
      tier: String(p.tier ?? "standard"), image_url: (p.image_url as string | null) ?? null,
      shopier_url: (p.shopier_url as string | null) ?? null, demo_video_url: (p.demo_video_url as string | null) ?? null,
      requires_email: bool(p.requires_email), retail_price_try: num(p.retail_price_try),
      retail_price_source_url: (p.retail_price_source_url as string | null) ?? null,
      duration_label: (p.duration_label as string | null) ?? null, grants_app: (p.grants_app as string | null) ?? null,
      grants_app_days: num(p.grants_app_days),
      warranty_price_try: num(p.warranty_price_try), warranty_label: (p.warranty_label as string | null) ?? null,
      available_count: num(p.available_count) ?? 0,
      total_count: num(p.total_count) ?? 0,
    }));
  });

const idsInput = z.array(z.string().uuid()).min(1).max(500);
const patchInput = z.object({
  ids: idsInput,
  patch: z.object({
    active: z.boolean().optional(), manual_fulfillment: z.boolean().optional(), featured: z.boolean().optional(),
    unlimited_stock: z.boolean().optional(), tier: z.enum(["standard", "epic"]).optional(),
    category: z.string().max(80).nullable().optional(),
  }),
});

export const bulkUpdateProducts = createServerFn({ method: "POST" }).middleware([requireAdmin])
  .validator((d: unknown) => patchInput.parse(d))
  .handler(async ({ data }) => {
    const entries = Object.entries(data.patch);
    if (!entries.length) return { updated: 0 };
    const placeholders = data.ids.map(() => "?").join(",");
    const values = entries.map(([, v]) => typeof v === "boolean" ? (v ? 1 : 0) : v ?? null);
    await mysqlQuery(`UPDATE products SET ${entries.map(([k]) => `${k}=?`).join(",")},updated_at=NOW() WHERE id IN (${placeholders})`, [...values, ...data.ids]);
    return { updated: data.ids.length };
  });

export const bulkPriceProducts = createServerFn({ method: "POST" }).middleware([requireAdmin])
  .validator((d: unknown) => z.object({ ids: idsInput, percent: z.number().min(-99).max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const placeholders = data.ids.map(() => "?").join(",");
    await mysqlQuery(`UPDATE products SET price_try=GREATEST(1,ROUND(price_try*(1+?/100),0)),updated_at=NOW() WHERE id IN (${placeholders})`, [data.percent, ...data.ids]);
    return { updated: data.ids.length };
  });

export const bulkDeleteProducts = createServerFn({ method: "POST" }).middleware([requireAdmin])
  .validator((d: unknown) => z.object({ ids: idsInput }).parse(d))
  .handler(async ({ data }) => {
    for (const id of data.ids) await mysqlQuery("DELETE FROM products WHERE id=?", [id]);
    return { deleted: data.ids.length };
  });

export const updateProductFields = createServerFn({ method: "POST" }).middleware([requireAdmin])
  .validator((d: unknown) => z.object({
    id: z.string().uuid(), image_url: z.string().max(500).nullable().optional(),
    delivery_type: z.enum(["key", "account", "link", "link_token"]).optional(),
    retail_price_try: z.number().min(0).nullable().optional(), retail_price_source_url: z.string().max(500).nullable().optional(),
    duration_label: z.string().max(100).nullable().optional(),
    warranty_price_try: z.number().min(0).max(1000000).nullable().optional(),
    warranty_label: z.string().max(100).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { id, ...patch } = data;
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
    if (entries.length) await mysqlQuery(`UPDATE products SET ${entries.map(([k]) => `${k}=?`).join(",")},updated_at=NOW() WHERE id=?`, [...entries.map(([,v]) => v ?? null), id]);
    return { ok: true };
  });
