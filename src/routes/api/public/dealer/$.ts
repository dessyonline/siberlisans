import { createFileRoute } from "@tanstack/react-router";
import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import { mysqlOne, mysqlQuery, num, bool } from "@/lib/mysql.server";
import { assignKeyToOrder } from "@/lib/license-mysql.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function readApiKey(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-api-key")?.trim() ?? "";
}

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function uid() {
  return randomUUID();
}

function genRef() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "SBR-";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const orderSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  pay: z.boolean().optional(),
});

type DealerRow = {
  discount_percent: number | null;
  tier_discount_percent: number | null;
};

async function apiDealerAuth(apiKey: string): Promise<string | null> {
  const hash = createHash("sha256").update(apiKey || "").digest("hex");
  const row = await mysqlOne<{ user_id: string; revoked: number }>(
    "SELECT user_id, revoked FROM dealer_api_keys WHERE key_hash=? LIMIT 1",
    [hash],
  );
  if (!row || bool(row.revoked)) return null;
  await mysqlQuery(
    "UPDATE dealer_api_keys SET last_used_at=?, call_count=call_count+1 WHERE key_hash=?",
    [ts(), hash],
  );
  const dealer = await mysqlOne<{ active: number }>(
    "SELECT active FROM dealers WHERE user_id=? AND active=1 LIMIT 1",
    [row.user_id],
  );
  if (!dealer) return null;
  return row.user_id;
}

async function dealerDiscountPercent(userId: string): Promise<number | null> {
  const row = await mysqlOne<DealerRow>(
    `SELECT d.discount_percent AS discount_percent, t.discount_percent AS tier_discount_percent
       FROM dealers d JOIN dealer_tiers t ON t.slug = d.tier_slug
      WHERE d.user_id=? AND d.active=1 LIMIT 1`,
    [userId],
  );
  if (!row) return null;
  return num(row.discount_percent) ?? num(row.tier_discount_percent) ?? 0;
}

type PriceListProduct = {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  price_try: unknown;
  unlimited_stock: number | null;
  manual_fulfillment: number | null;
};

async function apiDealerPriceList(userId: string) {
  const disc = await dealerDiscountPercent(userId);
  if (disc === null) throw new Error("Bayi değilsiniz");

  const products = await mysqlQuery<PriceListProduct>(
    `SELECT id, name, slug, category, price_try, unlimited_stock, manual_fulfillment
       FROM products WHERE active=1 ORDER BY sort_order, name`,
  );
  const out = [];
  for (const p of products) {
    const price = num(p.price_try) ?? 0;
    const available = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM license_keys WHERE product_id=? AND status='available'",
      [p.id],
    );
    out.push({
      id: p.id,
      name: p.name,
      slug: p.slug,
      category: p.category,
      price_try: price,
      dealer_price_try: Math.round((price * (100 - disc)) / 100 * 100) / 100,
      available: Number(available?.c ?? 0),
      unlimited_stock: bool(p.unlimited_stock),
      manual: bool(p.manual_fulfillment),
    });
  }
  return out;
}

async function apiDealerBalance(userId: string) {
  const wallet = await mysqlOne<{ balance_try: unknown }>(
    "SELECT balance_try FROM wallets WHERE user_id=? LIMIT 1",
    [userId],
  );
  const dealer = await mysqlOne<{
    code: string | null;
    tier_slug: string | null;
    discount_percent: unknown;
    commission_percent: unknown;
    tier_discount_percent: unknown;
    tier_commission_percent: unknown;
    total_volume_try: unknown;
    total_commission_try: unknown;
    paid_commission_try: unknown;
  }>(
    `SELECT d.code, d.tier_slug, d.discount_percent, d.commission_percent,
            t.discount_percent AS tier_discount_percent, t.commission_percent AS tier_commission_percent,
            d.total_volume_try, d.total_commission_try, d.paid_commission_try
       FROM dealers d JOIN dealer_tiers t ON t.slug = d.tier_slug
      WHERE d.user_id=? LIMIT 1`,
    [userId],
  );
  const totalCommission = num(dealer?.total_commission_try) ?? 0;
  const paidCommission = num(dealer?.paid_commission_try) ?? 0;
  return {
    balance_try: num(wallet?.balance_try) ?? 0,
    dealer_code: dealer?.code ?? null,
    tier: dealer?.tier_slug ?? null,
    discount_percent: num(dealer?.discount_percent) ?? num(dealer?.tier_discount_percent) ?? null,
    commission_percent: num(dealer?.commission_percent) ?? num(dealer?.tier_commission_percent) ?? null,
    total_volume_try: num(dealer?.total_volume_try) ?? 0,
    commission_pending_try: Math.max(0, totalCommission - paidCommission),
  };
}

async function apiDealerOrder(userId: string, reference: string) {
  const order = await mysqlOne<{
    id: string;
    reference_code: string;
    status: string;
    price_try: unknown;
    created_at: string;
    approved_at: string | null;
  }>(
    "SELECT id, reference_code, status, price_try, created_at, approved_at FROM orders WHERE reference_code=? AND user_id=? LIMIT 1",
    [reference, userId],
  );
  if (!order) throw new Error("Sipariş bulunamadı");

  const discountRow = await mysqlOne<{ d: unknown }>(
    "SELECT SUM(discount_try) d FROM order_discounts WHERE order_id=?",
    [order.id],
  );
  const items = await mysqlQuery<{ product_name_snapshot: string; quantity: number; unit_price_try: unknown }>(
    "SELECT product_name_snapshot, quantity, unit_price_try FROM order_items WHERE order_id=?",
    [order.id],
  );
  const keys = await mysqlQuery<{ key_value: string; expires_at: string | null; delivered_at: string | null }>(
    `SELECT lk.key_value, lk.expires_at, ok.delivered_at
       FROM order_keys ok JOIN license_keys lk ON lk.id = ok.license_key_id
      WHERE ok.order_id=?`,
    [order.id],
  );

  return {
    reference_code: order.reference_code,
    status: order.status,
    total_try: num(order.price_try) ?? 0,
    discount_try: num(discountRow?.d) ?? 0,
    created_at: order.created_at,
    approved_at: order.approved_at,
    items: items.map((i) => ({
      product: i.product_name_snapshot,
      quantity: i.quantity,
      unit_price_try: num(i.unit_price_try) ?? 0,
    })),
    keys: keys.map((k) => ({ key: k.key_value, expires_at: k.expires_at, delivered_at: k.delivered_at })),
  };
}

async function apiDealerCreateOrder(userId: string, productId: string, quantity: number) {
  const disc = await dealerDiscountPercent(userId);
  if (disc === null) throw new Error("Bayi değilsiniz");

  const product = await mysqlOne<{
    id: string;
    name: string;
    price_try: unknown;
    manual_fulfillment: number | null;
    unlimited_stock: number | null;
    active: number | null;
  }>(
    "SELECT id, name, price_try, manual_fulfillment, unlimited_stock, active FROM products WHERE id=? AND active=1 LIMIT 1",
    [productId],
  );
  if (!product) throw new Error("Ürün bulunamadı");

  if (!bool(product.manual_fulfillment) && !bool(product.unlimited_stock)) {
    const avail = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM license_keys WHERE product_id=? AND status='available'",
      [productId],
    );
    if (Number(avail?.c ?? 0) < quantity) {
      throw new Error(`Stokta yeterli anahtar yok (${Number(avail?.c ?? 0)} adet)`);
    }
  }

  const price = num(product.price_try) ?? 0;
  const subtotal = Math.round(price * quantity * 100) / 100;
  const discount = Math.round((subtotal * disc) / 100 * 100) / 100;

  const orderId = uid();
  const reference = genRef();
  await mysqlQuery(
    `INSERT INTO orders (id,user_id,product_id,price_try,reference_code,status,item_count,user_note,created_at,updated_at)
     VALUES (?,?,NULL,?,?, 'pending', ?, 'Bayi API siparişi', ?, ?)`,
    [orderId, userId, subtotal, reference, quantity, ts(), ts()],
  );
  await mysqlQuery(
    `INSERT INTO order_items (id,order_id,product_id,quantity,unit_price_try,product_name_snapshot)
     VALUES (?,?,?,?,?,?)`,
    [uid(), orderId, product.id, quantity, price, product.name],
  );
  if (discount > 0) {
    await mysqlQuery(
      `INSERT INTO order_discounts (id,order_id,code_snapshot,discount_try,product_id)
       VALUES (?,?,?,?,?)`,
      [uid(), orderId, "BAYI-" + disc, discount, product.id],
    );
  }

  return {
    order_id: orderId,
    reference_code: reference,
    total_try: Math.max(0, subtotal - discount),
    discount_try: discount,
  };
}

async function apiDealerPayOrder(userId: string, orderId: string) {
  const order = await mysqlOne<{ user_id: string; status: string; price_try: unknown }>(
    "SELECT user_id, status, price_try FROM orders WHERE id=? LIMIT 1",
    [orderId],
  );
  if (!order) throw new Error("Sipariş bulunamadı");
  if (order.user_id !== userId) throw new Error("Yetkisiz");
  if (order.status !== "pending" && order.status !== "reviewing") {
    throw new Error("Bu sipariş için ödeme yapılamaz");
  }

  const discountRow = await mysqlOne<{ d: unknown }>(
    "SELECT SUM(discount_try) d FROM order_discounts WHERE order_id=?",
    [orderId],
  );
  const price = num(order.price_try) ?? 0;
  const discount = num(discountRow?.d) ?? 0;
  const final = Math.max(0, price - discount);

  await mysqlQuery(
    `INSERT INTO wallets (user_id,balance_try,updated_at) VALUES (?,0,?)
     ON DUPLICATE KEY UPDATE user_id=user_id`,
    [userId, ts()],
  );
  const wallet = await mysqlOne<{ balance_try: unknown }>(
    "SELECT balance_try FROM wallets WHERE user_id=? LIMIT 1",
    [userId],
  );
  const balance = num(wallet?.balance_try) ?? 0;
  if (balance < final) throw new Error("Yetersiz bakiye");

  await mysqlQuery(
    "UPDATE wallets SET balance_try = balance_try - ?, updated_at=? WHERE user_id=? AND balance_try >= ?",
    [final, ts(), userId, final],
  );
  const after = await mysqlOne<{ balance_try: unknown }>(
    "SELECT balance_try FROM wallets WHERE user_id=? LIMIT 1",
    [userId],
  );
  const balanceAfter = num(after?.balance_try) ?? 0;
  if (balanceAfter > balance - final + 0.001 && balanceAfter >= balance) {
    throw new Error("Yetersiz bakiye");
  }

  await mysqlQuery(
    `INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_by,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [uid(), userId, "purchase", -final, balanceAfter, orderId, "Bayi API siparişi", userId, ts()],
  );
  await mysqlQuery(
    "UPDATE orders SET status='approved', approved_at=?, paid_with='wallet', updated_at=? WHERE id=?",
    [ts(), ts(), orderId],
  );

  const { licenseKey, activationToken } = await assignKeyToOrder(orderId);

  return { license_key: licenseKey, license_token: activationToken, balance_after: balanceAfter };
}

async function handle(request: Request, splat: string) {
  const path = (splat || "").replace(/^\/+|\/+$/g, "");
  const apiKey = readApiKey(request);
  if (!apiKey) return json({ error: "missing_api_key" }, 401);

  let userId: string | null;
  try {
    userId = await apiDealerAuth(apiKey);
  } catch {
    return json({ error: "auth_failed" }, 500);
  }
  if (!userId) return json({ error: "invalid_api_key" }, 401);

  try {
    if (request.method === "GET" && (path === "products" || path === "")) {
      const products = await apiDealerPriceList(userId);
      return json({ products });
    }

    if (request.method === "GET" && path === "balance") {
      const balance = await apiDealerBalance(userId);
      return json(balance);
    }

    if (request.method === "GET" && path.startsWith("orders/")) {
      const ref = decodeURIComponent(path.slice("orders/".length));
      const order = await apiDealerOrder(userId, ref);
      return json(order);
    }

    if (request.method === "POST" && path === "orders") {
      const parsed = orderSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return json({ error: "invalid_body", detail: parsed.error.issues }, 400);

      const order = await apiDealerCreateOrder(userId, parsed.data.product_id, parsed.data.quantity);
      if (parsed.data.pay === false) return json({ ...order, status: "pending" });

      try {
        const paid = await apiDealerPayOrder(userId, order.order_id);
        void paid;
      } catch (pErr) {
        return json(
          { ...order, status: "pending", payment_error: (pErr as Error).message },
          402,
        );
      }

      const detail = await apiDealerOrder(userId, order.reference_code);
      return json(detail ?? { ...order, status: "approved" });
    }

    return json({ error: "not_found" }, 404);
  } catch (e) {
    const message = (e as { message?: string })?.message ?? "unknown_error";
    return json({ error: message }, 400);
  }
}

export const Route = createFileRoute("/api/public/dealer/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => handle(request, (params as { _splat?: string })._splat ?? ""),
      POST: async ({ request, params }) => handle(request, (params as { _splat?: string })._splat ?? ""),
    },
  },
});
