import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type BundleItem = {
  quantity: number;
  product: { id: string; name: string; slug: string; price_try: number; image_url: string | null } | null;
};

export type Bundle = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_try: number;
  discount_percent: number;
  active: boolean;
  items: BundleItem[];
};

async function loadItems(bundleIds: string[]): Promise<Map<string, BundleItem[]>> {
  const map = new Map<string, BundleItem[]>();
  if (bundleIds.length === 0) return map;
  const { mysqlQuery } = await import("./mysql.server");
  const placeholders = bundleIds.map(() => "?").join(",");
  const rows = await mysqlQuery<Record<string, unknown>>(
    `SELECT bi.bundle_id, bi.quantity, p.id AS p_id, p.name, p.slug, p.price_try, p.image_url
       FROM product_bundle_items bi
       JOIN products p ON p.id = bi.product_id AND p.active = 1
      WHERE bi.bundle_id IN (${placeholders})`,
    bundleIds,
  );
  for (const r of rows) {
    const key = String(r.bundle_id);
    const list = map.get(key) ?? [];
    list.push({
      quantity: Number(r.quantity ?? 1),
      product: {
        id: String(r.p_id),
        name: String(r.name ?? ""),
        slug: String(r.slug ?? ""),
        price_try: Number(r.price_try ?? 0),
        image_url: (r.image_url as string | null) ?? null,
      },
    });
    map.set(key, list);
  }
  return map;
}

function toBundle(r: Record<string, unknown>, items: BundleItem[]): Bundle {
  return {
    id: String(r.id),
    slug: String(r.slug ?? ""),
    name: String(r.name ?? ""),
    description: (r.description as string | null) ?? null,
    price_try: Number(r.price_try ?? 0),
    discount_percent: Number(r.discount_percent ?? 0),
    active: true,
    items,
  };
}

export const listBundles = createServerFn({ method: "GET" }).handler(async (): Promise<Bundle[]> => {
  const { mysqlQuery } = await import("./mysql.server");
  const rows = await mysqlQuery<Record<string, unknown>>(
    `SELECT id, slug, name, description, price_try, discount_percent, active
       FROM product_bundles
      WHERE active = 1
      ORDER BY created_at DESC`,
  );
  const items = await loadItems(rows.map((r) => String(r.id)));
  return rows.map((r) => toBundle(r, items.get(String(r.id)) ?? []));
});

export const getBundleBySlug = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<Bundle | null> => {
    const { mysqlOne } = await import("./mysql.server");
    const row = await mysqlOne<Record<string, unknown>>(
      `SELECT id, slug, name, description, price_try, discount_percent, active
         FROM product_bundles
        WHERE slug = ? AND active = 1
        LIMIT 1`,
      [data.slug],
    );
    if (!row) return null;
    const items = await loadItems([String(row.id)]);
    return toBundle(row, items.get(String(row.id)) ?? []);
  });
