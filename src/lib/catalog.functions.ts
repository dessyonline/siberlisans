import { createServerFn } from "@tanstack/react-start";

/** Katalog verisi artık kendi MySQL sunucumuzdan okunur. */
export const listProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { mysqlQuery, num, bool } = await import("./mysql.server");

  const rows = await mysqlQuery<Record<string, any>>(
    `SELECT p.id, p.name, p.slug, p.description, p.duration, p.price_try, p.category,
            p.image_url, p.manual_fulfillment, p.stock_hint, p.unlimited_stock,
            p.supplier_out_of_stock, p.created_at, p.sort_order, p.tier,
            p.retail_price_try, p.retail_price_source_url, p.duration_label,
            p.orders_count, p.avg_rating, p.review_count,
            (SELECT COUNT(*) FROM license_keys k
              WHERE k.product_id = p.id AND k.status = 'available') AS available_keys
       FROM products p
      WHERE p.active = 1
      ORDER BY p.price_try ASC`,
  );

  return rows.map((r) => ({
    id: String(r.id),
    name: r.name as string,
    slug: r.slug as string,
    description: (r.description ?? null) as string | null,
    duration: (r.duration ?? null) as string | null,
    price_try: num(r.price_try) ?? 0,
    category: (r.category ?? null) as string | null,
    image_url: (r.image_url ?? null) as string | null,
    manual_fulfillment: bool(r.manual_fulfillment),
    stock_hint: num(r.stock_hint),
    unlimited_stock: bool(r.unlimited_stock),
    supplier_out_of_stock: bool(r.supplier_out_of_stock),
    created_at: String(r.created_at ?? ""),
    sort_order: num(r.sort_order) ?? 0,
    tier: (r.tier ?? null) as string | null,
    retail_price_try: num(r.retail_price_try),
    retail_price_source_url: (r.retail_price_source_url ?? null) as string | null,
    duration_label: (r.duration_label ?? null) as string | null,
    orders_count: num(r.orders_count) ?? 0,
    avg_rating: num(r.avg_rating) ?? 0,
    review_count: num(r.review_count) ?? 0,
    license_keys: Array.from({ length: num(r.available_keys) ?? 0 }, () => ({
      status: "available" as const,
    })),
  }));
});
