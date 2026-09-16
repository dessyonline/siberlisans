import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";

const PRODUCT_COLS =
  "id, name, slug, duration, image_url, delivery_type, manual_fulfillment, unlimited_stock, tier, source, required_fields, shopier_url, requires_email, category";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function parseJson(v: unknown): Json {
  if (v == null) return null;
  if (typeof v === "object") return v as Json;
  try {
    return JSON.parse(String(v)) as Json;
  } catch {
    return null;
  }
}

/** Ödeme sayfasının beklediği iç içe sipariş yapısı. */
export const getOrderDetail = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ orderId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { mysqlQuery, mysqlOne, num, bool } = await import("./mysql.server");

    const order = await mysqlOne<Record<string, unknown>>(
      `SELECT id, user_id, product_id, status, price_try, reference_code, receipt_path, user_note,
              checkout_fields, created_at, updated_at, approved_at
         FROM orders WHERE id=? LIMIT 1`,
      [data.orderId],
    );
    if (!order) throw new Error("Sipariş bulunamadı.");
    const isAdmin = context.isAdmin === true;
    if (order.user_id !== context.userId && !isAdmin) throw new Error("Yetkisiz.");

    const mapProduct = (p: Record<string, unknown> | null): Record<string, Json> | null =>
      p
        ? {
            ...(p as Record<string, Json>),
            manual_fulfillment: bool(p.manual_fulfillment),
            unlimited_stock: bool(p.unlimited_stock),
            requires_email: bool(p.requires_email),
            required_fields: parseJson(p.required_fields),
          }
        : null;

    const product = order.product_id
      ? await mysqlOne<Record<string, unknown>>(`SELECT ${PRODUCT_COLS} FROM products WHERE id=? LIMIT 1`, [
          String(order.product_id),
        ])
      : null;

    const items = await mysqlQuery<Record<string, unknown>>(
      `SELECT oi.id, oi.product_id, oi.quantity, oi.unit_price_try, oi.product_name_snapshot,
              p.name AS p_name, p.slug AS p_slug, p.image_url AS p_image_url, p.duration AS p_duration,
              p.delivery_type AS p_delivery_type, p.manual_fulfillment AS p_manual_fulfillment,
              p.unlimited_stock AS p_unlimited_stock, p.shopier_url AS p_shopier_url,
              p.requires_email AS p_requires_email, p.required_fields AS p_required_fields,
              p.category AS p_category
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ?
        ORDER BY oi.created_at`,
      [data.orderId],
    );

    const keys = await mysqlQuery<Record<string, unknown>>(
      `SELECT lk.key_value, lk.activation_token, p.name AS p_name, p.delivery_type AS p_delivery_type
         FROM order_keys ok
         JOIN license_keys lk ON lk.id = ok.license_key_id
         LEFT JOIN products p ON p.id = lk.product_id
        WHERE ok.order_id = ?`,
      [data.orderId],
    );

    const discount = await mysqlQuery<Record<string, unknown>>(
      "SELECT product_id, discount_try, code_snapshot FROM order_discounts WHERE order_id=?",
      [data.orderId],
    );

    return {
      id: String(order.id),
      product_id: (order.product_id as string) ?? null,
      status: String(order.status ?? ""),
      price_try: num(order.price_try) ?? 0,
      reference_code: (order.reference_code as string) ?? null,
      receipt_path: (order.receipt_path as string) ?? null,
      user_note: (order.user_note as string) ?? null,
      checkout_fields: parseJson(order.checkout_fields),
      created_at: (order.created_at as string) ?? null,
      updated_at: (order.updated_at as string) ?? null,
      approved_at: (order.approved_at as string) ?? null,
      product: mapProduct(product),
      items: items.map((i) => ({
        id: i.id as string,
        product_id: i.product_id as string,
        quantity: Number(i.quantity ?? 1),
        unit_price_try: num(i.unit_price_try) ?? 0,
        product_name_snapshot: (i.product_name_snapshot as string) ?? null,
        product: i.p_name
          ? mapProduct({
              name: i.p_name,
              slug: i.p_slug,
              image_url: i.p_image_url,
              duration: i.p_duration,
              delivery_type: i.p_delivery_type,
              manual_fulfillment: i.p_manual_fulfillment,
              unlimited_stock: i.p_unlimited_stock,
              shopier_url: i.p_shopier_url,
              requires_email: i.p_requires_email,
              required_fields: i.p_required_fields,
              category: i.p_category,
            })
          : null,
      })),
      keys: keys.map((k) => ({
        license_key: {
          key_value: (k.key_value as string) ?? null,
          activation_token: (k.activation_token as string) ?? null,
          product: { name: (k.p_name as string) ?? null, delivery_type: (k.p_delivery_type as string) ?? null },
        },
      })),
      discount: discount.map((d) => ({
        product_id: (d.product_id as string) ?? null,
        discount_try: num(d.discount_try) ?? 0,
        code_snapshot: (d.code_snapshot as string) ?? null,
      })),
    };
  });

export const getActiveBankAccount = createServerFn({ method: "GET" }).handler(async () => {
  const { mysqlOne } = await import("./mysql.server");
  return await mysqlOne<{
    id: string;
    bank_name: string | null;
    iban: string | null;
    holder_name: string | null;
  }>("SELECT id, bank_name, iban, holder_name FROM bank_accounts WHERE active=1 ORDER BY created_at LIMIT 1");
});

export const getMyBalance = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { mysqlOne, num } = await import("./mysql.server");
    const w = await mysqlOne<{ balance_try: unknown }>(
      "SELECT balance_try FROM wallets WHERE user_id=? LIMIT 1",
      [context.userId],
    );
    return { balance_try: num(w?.balance_try) ?? 0 };
  });

export const getCrossSellOffer = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z.object({ categories: z.array(z.string()), excludeSlugs: z.array(z.string()) }).parse(d),
  )
  .handler(async ({ data }) => {
    if (data.categories.length === 0) return null;
    const { mysqlQuery, mysqlOne, num } = await import("./mysql.server");
    const ph = data.categories.map(() => "?").join(",");
    const rules = await mysqlQuery<{
      from_category: string;
      to_category: string;
      discount_percent: number;
      promo_code: string | null;
      note: string | null;
    }>(
      `SELECT from_category, to_category, discount_percent, promo_code, note
         FROM cross_sell_rules
        WHERE active=1 AND from_category IN (${ph})
        ORDER BY discount_percent DESC LIMIT 1`,
      data.categories,
    );
    const rule = rules[0];
    if (!rule) return null;

    const exPh = data.excludeSlugs.length ? data.excludeSlugs.map(() => "?").join(",") : null;
    const product = await mysqlOne<{
      id: string;
      name: string;
      slug: string;
      price_try: unknown;
      image_url: string | null;
      tier: string | null;
      duration: string | null;
    }>(
      `SELECT id, name, slug, price_try, image_url, tier, duration
         FROM products
        WHERE active=1 AND category=? ${exPh ? `AND slug NOT IN (${exPh})` : ""}
        ORDER BY sort_order DESC LIMIT 1`,
      exPh ? [rule.to_category, ...data.excludeSlugs] : [rule.to_category],
    );
    if (!product) return null;
    const original = num(product.price_try) ?? 0;
    const discounted = Math.round(original * (1 - Number(rule.discount_percent ?? 0) / 100));
    return { rule, product: { ...product, price_try: original }, original, discounted };
  });
