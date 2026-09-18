import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";

const idsInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) });

export type CompareProduct = {
  id: string;
  name: string;
  slug: string;
  price_try: number;
  retail_price_try: number | null;
  duration: string | null;
  duration_label: string | null;
  delivery_type: string | null;
  category: string | null;
  image_url: string | null;
  unlimited_stock: boolean;
  manual_fulfillment: boolean;
  stock_hint: number | null;
  avg_rating: number;
  review_count: number;
  orders_count: number;
  active: boolean;
  requires_email: boolean;
};

/** Karşılaştırma / compare-bar için ürün detayları. */
export const getProductsForCompare = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => idsInput.parse(input))
  .handler(async ({ data }): Promise<CompareProduct[]> => {
    const { mysqlQuery, num, bool } = await import("./mysql.server");
    const placeholders = data.ids.map(() => "?").join(",");
    const rows = await mysqlQuery<Record<string, unknown>>(
      `SELECT id, name, slug, price_try, retail_price_try, duration, duration_label, delivery_type,
              category, image_url, unlimited_stock, manual_fulfillment, stock_hint,
              avg_rating, review_count, orders_count, active, requires_email
         FROM products WHERE id IN (${placeholders})`,
      data.ids,
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      slug: String(r.slug ?? ""),
      price_try: num(r.price_try) ?? 0,
      retail_price_try: num(r.retail_price_try),
      duration: (r.duration as string | null) ?? null,
      duration_label: (r.duration_label as string | null) ?? null,
      delivery_type: (r.delivery_type as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      image_url: (r.image_url as string | null) ?? null,
      unlimited_stock: bool(r.unlimited_stock),
      manual_fulfillment: bool(r.manual_fulfillment),
      stock_hint: num(r.stock_hint),
      avg_rating: num(r.avg_rating) ?? 0,
      review_count: num(r.review_count) ?? 0,
      orders_count: num(r.orders_count) ?? 0,
      active: bool(r.active),
      requires_email: bool(r.requires_email),
    }));
  });

/** Sepetteki ürünler için canlı fiyat + aktif flash indirim. */
export const getCartLivePricing = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => idsInput.parse(input))
  .handler(async ({ data }) => {
    const { mysqlQuery, num } = await import("./mysql.server");
    const placeholders = data.ids.map(() => "?").join(",");
    const [products, sales] = await Promise.all([
      mysqlQuery<{ id: string; price_try: unknown }>(
        `SELECT id, price_try FROM products WHERE id IN (${placeholders})`,
        data.ids,
      ),
      mysqlQuery<{
        id: string;
        product_id: string;
        discount_type: string;
        discount_value: unknown;
        ends_at: string;
        label: string | null;
      }>(
        `SELECT id, product_id, discount_type, discount_value, ends_at, label
           FROM flash_sales
          WHERE product_id IN (${placeholders}) AND is_active = 1
            AND starts_at <= UTC_TIMESTAMP() AND ends_at > UTC_TIMESTAMP()
          ORDER BY ends_at ASC`,
        data.ids,
      ),
    ]);

    const firstSaleByProduct = new Map<string, (typeof sales)[number]>();
    for (const s of sales) {
      if (!firstSaleByProduct.has(s.product_id)) firstSaleByProduct.set(s.product_id, s);
    }

    const out: Record<
      string,
      { priceTry: number; sale: { id: string; discount_type: "percent" | "amount"; discount_value: number; ends_at: string; label: string | null } | null }
    > = {};
    for (const p of products) {
      const sale = firstSaleByProduct.get(p.id) ?? null;
      out[p.id] = {
        priceTry: num(p.price_try) ?? 0,
        sale: sale
          ? {
              id: sale.id,
              discount_type: sale.discount_type === "percent" ? "percent" : "amount",
              discount_value: num(sale.discount_value) ?? 0,
              ends_at: String(sale.ends_at).includes("T") ? String(sale.ends_at) : String(sale.ends_at).replace(" ", "T") + "Z",
              label: sale.label,
            }
          : null,
      };
    }
    return out;
  });

/** Son eklenen aktif ürünler (bubble için). */
export const getRecentActiveProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { mysqlQuery, num } = await import("./mysql.server");
  const rows = await mysqlQuery<Record<string, unknown>>(
    `SELECT id, name, slug, price_try, created_at, category
       FROM products WHERE active = 1
       ORDER BY created_at DESC LIMIT 6`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    slug: String(r.slug ?? ""),
    price_try: num(r.price_try) ?? 0,
    created_at: String(r.created_at ?? ""),
    category: (r.category as string | null) ?? null,
  }));
});

/** "Bunu alanlar bunları da aldı" önerileri. */
export const getAlsoBoughtProducts = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ productId: z.string().uuid(), limit: z.number().int().min(1).max(12).default(6) }).parse(input))
  .handler(async ({ data }) => {
    const { mysqlQuery, mysqlOne, num } = await import("./mysql.server");

    const co = await mysqlQuery<{ product_id: string; cnt: number }>(
      `SELECT o2.product_id AS product_id, COUNT(DISTINCT o2.user_id) AS cnt
         FROM orders o1
         JOIN orders o2 ON o2.user_id = o1.user_id AND o2.status = 'approved' AND o2.product_id <> ?
        WHERE o1.product_id = ? AND o1.status = 'approved' AND o1.user_id IS NOT NULL AND o2.product_id IS NOT NULL
        GROUP BY o2.product_id
        ORDER BY cnt DESC
        LIMIT ?`,
      [data.productId, data.productId, data.limit],
    );

    let merged = co;
    if (merged.length === 0) {
      const current = await mysqlOne<{ category: string | null }>("SELECT category FROM products WHERE id=?", [data.productId]);
      const fallback = await mysqlQuery<{ id: string }>(
        `SELECT id FROM products
           WHERE active = 1 AND id <> ? AND category <=> ?
           ORDER BY COALESCE(review_count,0) DESC, created_at DESC
           LIMIT ?`,
        [data.productId, current?.category ?? null, data.limit],
      );
      merged = fallback.map((f) => ({ product_id: f.id, cnt: 0 }));
    }
    if (merged.length === 0) return [];

    const ids = merged.map((m) => m.product_id);
    const placeholders = ids.map(() => "?").join(",");
    const products = await mysqlQuery<Record<string, unknown>>(
      `SELECT id, name, slug, image_url, price_try, category FROM products WHERE id IN (${placeholders}) AND active = 1`,
      ids,
    );
    const cntMap = new Map(merged.map((m) => [m.product_id, m.cnt]));
    return products
      .map((p) => ({
        id: String(p.id),
        name: String(p.name ?? ""),
        slug: String(p.slug ?? ""),
        image_url: (p.image_url as string | null) ?? null,
        price_try: num(p.price_try),
        category: (p.category as string | null) ?? null,
        buyers: Number(cntMap.get(String(p.id)) ?? 0),
      }))
      .sort((a, b) => b.buyers - a.buyers)
      .slice(0, data.limit);
  });

/** Herkese açık son satışlar (canlı satış şeridi / popup). */
export const getRecentPublicSales = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ limit: z.number().int().min(1).max(20).default(8) }).parse(input))
  .handler(async ({ data }) => {
    const { mysqlQuery } = await import("./mysql.server");
    const rows = await mysqlQuery<{
      id: string;
      product_name: string;
      product_slug: string;
      image_url: string | null;
      display_name: string | null;
      created_at: string;
    }>(
      `SELECT o.id, p.name AS product_name, p.slug AS product_slug, p.image_url, pr.display_name, o.approved_at AS created_at
         FROM orders o
         JOIN products p ON p.id = o.product_id
         LEFT JOIN profiles pr ON pr.id = o.user_id
        WHERE o.status = 'approved' AND o.approved_at IS NOT NULL
          AND o.approved_at > (NOW() - INTERVAL 30 DAY) AND p.active = 1
        ORDER BY o.approved_at DESC
        LIMIT ?`,
      [data.limit],
    );
    return rows.map((r) => ({
      id: String(r.id),
      product_name: r.product_name,
      product_slug: r.product_slug,
      image_url: r.image_url,
      masked_buyer: `${(r.display_name ?? "siber").trim().slice(0, 1).toUpperCase()}***`,
      created_at: String(r.created_at ?? "").includes("T") ? String(r.created_at) : String(r.created_at).replace(" ", "T") + "Z",
    }));
  });

/** Onboarding turu görüldü mü? */
export const getOnboardingStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { mysqlOne } = await import("./mysql.server");
    const row = await mysqlOne<{ onboarded_at: string | null }>(
      "SELECT onboarded_at FROM profiles WHERE id=? LIMIT 1",
      [context.userId],
    );
    return { onboarded: !!row?.onboarded_at };
  });

export const markOnboarded = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { mysqlQuery } = await import("./mysql.server");
    await mysqlQuery("UPDATE profiles SET onboarded_at = COALESCE(onboarded_at, NOW()) WHERE id=?", [context.userId]);
    return { ok: true };
  });
