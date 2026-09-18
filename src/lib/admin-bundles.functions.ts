import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-middleware.server";
import { mysqlQuery, mysqlOne, num, bool } from "@/lib/mysql.server";

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export type AdminBundleItem = {
  product_id: string;
  quantity: number;
  product: { name: string; price_try: number; cost_try: number | null } | null;
};

export type AdminBundleRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_try: number;
  discount_percent: number;
  active: boolean;
  items: AdminBundleItem[];
};

export type BundleProductOption = { id: string; name: string; price_try: number; cost_try: number | null };

export const listAdminBundles = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<AdminBundleRow[]> => {
    const bundles = await mysqlQuery<Record<string, unknown>>(
      "SELECT * FROM product_bundles ORDER BY created_at DESC",
    );
    const ids = bundles.map((b) => String(b.id));
    const itemsByBundle = new Map<string, AdminBundleItem[]>();
    if (ids.length > 0) {
      const ph = ids.map(() => "?").join(",");
      const items = await mysqlQuery<Record<string, unknown>>(
        `SELECT i.bundle_id, i.product_id, i.quantity, p.name, p.price_try, p.cost_try
           FROM product_bundle_items i
           LEFT JOIN products p ON p.id = i.product_id
          WHERE i.bundle_id IN (${ph})`,
        ids,
      );
      for (const it of items) {
        const key = String(it.bundle_id);
        const list = itemsByBundle.get(key) ?? [];
        list.push({
          product_id: String(it.product_id),
          quantity: Number(it.quantity ?? 1),
          product: it.name
            ? { name: String(it.name), price_try: num(it.price_try) ?? 0, cost_try: num(it.cost_try) }
            : null,
        });
        itemsByBundle.set(key, list);
      }
    }
    return bundles.map((b) => ({
      id: String(b.id),
      slug: String(b.slug),
      name: String(b.name),
      description: (b.description as string | null) ?? null,
      price_try: num(b.price_try) ?? 0,
      discount_percent: num(b.discount_percent) ?? 0,
      active: bool(b.active),
      items: itemsByBundle.get(String(b.id)) ?? [],
    }));
  });

export const listBundleProductOptions = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<BundleProductOption[]> => {
    const rows = await mysqlQuery<Record<string, unknown>>(
      "SELECT id, name, price_try, cost_try FROM products WHERE active=1 ORDER BY name",
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      price_try: num(r.price_try) ?? 0,
      cost_try: num(r.cost_try),
    }));
  });

const createInput = z.object({
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  price_try: z.number().positive(),
  discount_percent: z.number().min(0).max(100).default(0),
});

export const createBundle = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data }) => {
    const id = crypto.randomUUID();
    await mysqlQuery(
      `INSERT INTO product_bundles (id,slug,name,description,price_try,discount_percent,active,created_at,updated_at)
       VALUES (?,?,?,?,?,?,1,?,?)`,
      [id, data.slug, data.name, data.description ?? null, data.price_try, data.discount_percent, ts(), ts()],
    );
    return { id };
  });

const updateInput = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  price_try: z.number().positive(),
  discount_percent: z.number().min(0).max(100),
});

export const updateBundle = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => updateInput.parse(d))
  .handler(async ({ data }) => {
    await mysqlQuery(
      `UPDATE product_bundles SET slug=?, name=?, description=?, price_try=?, discount_percent=?, updated_at=?
         WHERE id=?`,
      [data.slug, data.name, data.description ?? null, data.price_try, data.discount_percent, ts(), data.id],
    );
    return { ok: true };
  });

export const toggleBundleActive = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const row = await mysqlOne<{ active: number }>("SELECT active FROM product_bundles WHERE id=?", [data.id]);
    const next = row ? (bool(row.active) ? 0 : 1) : 1;
    await mysqlQuery("UPDATE product_bundles SET active=?, updated_at=? WHERE id=?", [next, ts(), data.id]);
    return { ok: true };
  });

export const deleteBundle = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await mysqlQuery("DELETE FROM product_bundle_items WHERE bundle_id=?", [data.id]);
    await mysqlQuery("DELETE FROM product_bundles WHERE id=?", [data.id]);
    return { ok: true };
  });

const itemInput = z.object({ bundleId: z.string().uuid(), productId: z.string().uuid() });

export const addBundleItem = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => itemInput.parse(d))
  .handler(async ({ data }) => {
    await mysqlQuery(
      `INSERT INTO product_bundle_items (bundle_id, product_id, quantity)
       VALUES (?,?,1)
       ON DUPLICATE KEY UPDATE quantity=quantity`,
      [data.bundleId, data.productId],
    );
    return { ok: true };
  });

const qtyInput = z.object({ bundleId: z.string().uuid(), productId: z.string().uuid(), quantity: z.number().int().min(1).max(999) });

export const updateBundleItemQty = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => qtyInput.parse(d))
  .handler(async ({ data }) => {
    await mysqlQuery(
      "UPDATE product_bundle_items SET quantity=? WHERE bundle_id=? AND product_id=?",
      [data.quantity, data.bundleId, data.productId],
    );
    return { ok: true };
  });

export const removeBundleItem = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => itemInput.parse(d))
  .handler(async ({ data }) => {
    await mysqlQuery(
      "DELETE FROM product_bundle_items WHERE bundle_id=? AND product_id=?",
      [data.bundleId, data.productId],
    );
    return { ok: true };
  });
