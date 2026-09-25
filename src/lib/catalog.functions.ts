import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Katalog verisi artık kendi MySQL sunucumuzdan okunur. */
export const listProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { mysqlQuery, num, bool } = await import("./mysql.server");

  const rows = await mysqlQuery<Record<string, any>>(
    `SELECT p.id, p.name, p.slug, p.description, p.duration, p.price_try, p.category,
            p.image_url, p.manual_fulfillment, p.stock_hint, p.unlimited_stock,
            p.supplier_out_of_stock, p.created_at, p.sort_order, p.tier,
            p.retail_price_try, p.retail_price_source_url, p.duration_label,
            p.orders_count, p.avg_rating, p.review_count, p.featured, p.demo_video_url, p.warranty_price_try, p.warranty_label,
            (SELECT COUNT(*) FROM license_keys k
              WHERE k.product_id = p.id AND k.status = 'available') AS available_keys
       FROM products p
      WHERE p.active = 1
      ORDER BY p.price_try ASC`,
  );

  return rows.map((r) => ({
    id: String(r.id),
    active: true,
    featured: bool(r.featured),
    demo_video_url: (r.demo_video_url ?? null) as string | null,
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
    warranty_price_try: num(r.warranty_price_try),
    warranty_label: (r.warranty_label ?? null) as string | null,
    orders_count: num(r.orders_count) ?? 0,
    avg_rating: num(r.avg_rating) ?? 0,
    review_count: num(r.review_count) ?? 0,
    license_keys: Array.from({ length: num(r.available_keys) ?? 0 }, () => ({
      status: "available" as const,
    })),
  }));
});

/** Public detail output contains only the same allowlisted catalog fields. */
export const getProduct = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(250) }).parse(input))
  .handler(async ({ data }) => {
    const products = await listProducts();
    const product = products.find((p) => p.slug === data.slug) ?? null;
    return {
      product: product ? { ...product, reviewCount: product.review_count, ratingAvg: product.avg_rating } : null,
      relatedProducts: product?.category
        ? products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4)
        : [],
    };
  });

export const listActiveFlashSales = createServerFn({ method: "GET" }).handler(async () => {
  const { mysqlQuery, num } = await import("./mysql.server");
  const rows = await mysqlQuery<Record<string, unknown>>(
    `SELECT id, product_id, discount_type, discount_value, ends_at, label
       FROM flash_sales WHERE is_active = 1 AND starts_at <= UTC_TIMESTAMP()
       AND ends_at > UTC_TIMESTAMP() ORDER BY ends_at ASC`,
  );
  return rows.map((r) => ({
    id: String(r.id), product_id: String(r.product_id),
    discount_type: r.discount_type === "percent" ? "percent" as const : "amount" as const,
    discount_value: num(r.discount_value) ?? 0,
    ends_at: String(r.ends_at).includes("T") ? String(r.ends_at) : String(r.ends_at).replace(" ", "T") + "Z",
    label: r.label == null ? null : String(r.label),
  }));
});
