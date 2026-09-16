import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./auth-middleware.server";
import { bool, mysqlOne, mysqlQuery, num } from "./mysql.server";

function ts(date: Date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
function jsonObject(value: unknown): Record<string, string> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, string>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
async function audit(userId: string, email: string | null, action: string, entityId: string, metadata: unknown = null) {
  await mysqlQuery(
    `INSERT INTO admin_audit_log (id, actor_id, actor_email, action, entity_type, entity_id, metadata, created_at)
     VALUES (?, ?, ?, ?, 'order', ?, ?, NOW())`,
    [crypto.randomUUID(), userId, email, action, entityId, metadata ? JSON.stringify(metadata) : null],
  );
}

export type AdminOrderRow = {
  id: string; reference_code: string; status: string; price_try: number; discount_try: number; net_try: number;
  discount_codes: string[]; paid_with: string | null; created_at: string; approved_at: string | null;
  user_note: string | null; admin_note: string | null; receipt_path: string | null; external_order_id: string | null;
  external_status: string | null; external_delivery_data: string | null; checkout_fields: Record<string, string> | null;
  product_id: string | null; product_name: string | null; product_source: string | null; manual_fulfillment: boolean;
  user_id: string | null; buyer_email: string | null; buyer_name: string | null;
};

const listInput = z.object({
  status: z.string().default("reviewing"), range: z.enum(["today", "7d", "30d", "all"]).default("all"),
  q: z.string().default(""), productId: z.string().default(""), paidWith: z.string().default(""),
  minAmount: z.number().nullable().default(null), maxAmount: z.number().nullable().default(null),
  onlyMessage: z.boolean().default(false), sort: z.enum(["created_at", "price_try", "status"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"), page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(10).max(200).default(50),
});

export const listAdminOrders = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => listInput.parse(d ?? {}))
  .handler(async ({ data }) => {
    const where: string[] = ["1=1"];
    const params: Array<string | number> = [];
    if (data.status !== "all") { where.push("o.status = ?"); params.push(data.status); }
    if (data.paidWith) { where.push("o.paid_with = ?"); params.push(data.paidWith); }
    if (data.productId) { where.push("o.product_id = ?"); params.push(data.productId); }
    if (data.minAmount != null) { where.push("o.price_try >= ?"); params.push(data.minAmount); }
    if (data.maxAmount != null) { where.push("o.price_try <= ?"); params.push(data.maxAmount); }
    if (data.onlyMessage) where.push("o.user_note IS NOT NULL AND o.user_note <> ''");
    if (data.range !== "all") {
      const days = data.range === "today" ? 1 : data.range === "7d" ? 7 : 30;
      where.push("o.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)"); params.push(days);
    }
    const term = data.q.trim();
    if (term) {
      where.push("(o.reference_code LIKE ? OR o.external_order_id LIKE ? OR o.user_note LIKE ? OR pr.email LIKE ? OR pr.display_name LIKE ?)");
      for (let i = 0; i < 5; i++) params.push(`%${term}%`);
    }
    const whereSql = where.join(" AND ");
    const count = await mysqlOne<{ total: string | number }>(
      `SELECT COUNT(*) total FROM orders o LEFT JOIN profiles pr ON pr.id=o.user_id WHERE ${whereSql}`, params,
    );
    const offset = (data.page - 1) * data.perPage;
    const rows = await mysqlQuery<Record<string, unknown>>(
      `SELECT o.id, o.reference_code, o.status, o.price_try, o.paid_with, o.created_at, o.approved_at,
              o.user_note, o.admin_note, o.receipt_path, o.external_order_id, o.external_status,
              o.external_delivery_data, o.checkout_fields, o.product_id, o.user_id,
              p.name product_name, p.source product_source, p.manual_fulfillment,
              pr.email buyer_email, pr.display_name buyer_name,
              COALESCE(d.discount_try,0) discount_try, d.discount_codes
         FROM orders o
         LEFT JOIN products p ON p.id=o.product_id
         LEFT JOIN profiles pr ON pr.id=o.user_id
         LEFT JOIN (SELECT order_id, SUM(discount_try) discount_try, GROUP_CONCAT(code_snapshot SEPARATOR ',') discount_codes
                      FROM order_discounts GROUP BY order_id) d ON d.order_id=o.id
        WHERE ${whereSql}
        ORDER BY o.${data.sort} ${data.dir === "asc" ? "ASC" : "DESC"} LIMIT ? OFFSET ?`,
      [...params, data.perPage, offset],
    );
    const out: AdminOrderRow[] = rows.map((o) => {
      const gross = num(o.price_try) ?? 0; const discount = num(o.discount_try) ?? 0;
      return {
        id: String(o.id), reference_code: String(o.reference_code), status: String(o.status), price_try: gross,
        discount_try: discount, net_try: Math.max(0, gross - discount),
        discount_codes: o.discount_codes ? String(o.discount_codes).split(",").filter(Boolean) : [],
        paid_with: (o.paid_with as string | null) ?? null, created_at: String(o.created_at),
        approved_at: o.approved_at ? String(o.approved_at) : null, user_note: (o.user_note as string | null) ?? null,
        admin_note: (o.admin_note as string | null) ?? null, receipt_path: (o.receipt_path as string | null) ?? null,
        external_order_id: (o.external_order_id as string | null) ?? null,
        external_status: (o.external_status as string | null) ?? null,
        external_delivery_data: (o.external_delivery_data as string | null) ?? null,
        checkout_fields: jsonObject(o.checkout_fields), product_id: (o.product_id as string | null) ?? null,
        product_name: (o.product_name as string | null) ?? null, product_source: (o.product_source as string | null) ?? null,
        manual_fulfillment: bool(o.manual_fulfillment), user_id: (o.user_id as string | null) ?? null,
        buyer_email: (o.buyer_email as string | null) ?? null, buyer_name: (o.buyer_name as string | null) ?? null,
      };
    });
    return { rows: out, total: num(count?.total) ?? out.length, page: data.page, perPage: data.perPage };
  });

export const getOrderKpis = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const [waiting, today, recent] = await Promise.all([
    mysqlOne<{ total: unknown }>("SELECT COUNT(*) total FROM orders WHERE status IN ('pending','reviewing')"),
    mysqlOne<{ orders_today: unknown; approved_today: unknown; revenue_today: unknown }>(
      `SELECT COUNT(*) orders_today, SUM(status='approved') approved_today,
              COALESCE(SUM(CASE WHEN status='approved' THEN price_try ELSE 0 END),0) revenue_today
         FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`),
    mysqlQuery<{ created_at: string; approved_at: string }>(
      "SELECT created_at, approved_at FROM orders WHERE status='approved' AND approved_at IS NOT NULL ORDER BY approved_at DESC LIMIT 50"),
  ]);
  const durations = recent.map((o) => (new Date(o.approved_at).getTime() - new Date(o.created_at).getTime()) / 60000).filter((n) => Number.isFinite(n) && n >= 0);
  return { waiting: num(waiting?.total) ?? 0, ordersToday: num(today?.orders_today) ?? 0,
    approvedToday: num(today?.approved_today) ?? 0, revenueToday: num(today?.revenue_today) ?? 0,
    avgApproveMinutes: durations.length ? Math.round(durations.reduce((a,b) => a+b, 0) / durations.length) : 0 };
});

export const getOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const order = await mysqlOne<Record<string, unknown>>("SELECT * FROM orders WHERE id=? LIMIT 1", [data.orderId]);
    if (!order) throw new Error("Sipariş bulunamadı");
    const userId = order.user_id ? String(order.user_id) : null;
    const [keys, discounts, auditRows, profile, wallet, userOrders, txns, product] = await Promise.all([
      mysqlQuery<Record<string, unknown>>(`SELECT ok.delivered_at, lk.id, lk.key_value, lk.status, lk.expires_at, lk.hwid, lk.activated_at, lk.duration_days FROM order_keys ok JOIN license_keys lk ON lk.id=ok.license_key_id WHERE ok.order_id=?`, [data.orderId]),
      mysqlQuery<Record<string, unknown>>("SELECT code_snapshot, discount_try FROM order_discounts WHERE order_id=?", [data.orderId]),
      mysqlQuery<Record<string, unknown>>("SELECT action, actor_email, metadata, created_at FROM admin_audit_log WHERE entity_id=? ORDER BY created_at", [data.orderId]),
      userId ? mysqlOne<Record<string, unknown>>("SELECT id,email,display_name,created_at,tier,total_points FROM profiles WHERE id=? LIMIT 1", [userId]) : null,
      userId ? mysqlOne<Record<string, unknown>>("SELECT balance_try FROM wallets WHERE user_id=? LIMIT 1", [userId]) : null,
      userId ? mysqlQuery<Record<string, unknown>>("SELECT id,reference_code,status,price_try,created_at FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 6", [userId]) : [],
      mysqlQuery<Record<string, unknown>>("SELECT kind,amount_try,note,created_at FROM wallet_transactions WHERE order_id=? ORDER BY created_at", [data.orderId]),
      order.product_id ? mysqlOne<Record<string, unknown>>("SELECT id,name,source,delivery_type,price_try FROM products WHERE id=? LIMIT 1", [String(order.product_id)]) : null,
    ]);
    const spent = userOrders.filter((o) => o.status === "approved").reduce((sum, o) => sum + (num(o.price_try) ?? 0), 0);
    return {
      order: { id: String(order.id), reference_code: String(order.reference_code), status: String(order.status), price_try: num(order.price_try) ?? 0,
        paid_with: (order.paid_with as string | null) ?? null, created_at: String(order.created_at), approved_at: order.approved_at ? String(order.approved_at) : null,
        updated_at: order.updated_at ? String(order.updated_at) : null, user_note: (order.user_note as string | null) ?? null,
        admin_note: (order.admin_note as string | null) ?? null, receipt_path: (order.receipt_path as string | null) ?? null,
        checkout_fields: jsonObject(order.checkout_fields), external_order_id: (order.external_order_id as string | null) ?? null,
        external_status: (order.external_status as string | null) ?? null, external_delivery_data: (order.external_delivery_data as string | null) ?? null,
        client_ip: (order.client_ip as string | null) ?? null, product_id: order.product_id ? String(order.product_id) : null, user_id: userId },
      product, keys: keys.map((k) => ({ delivered_at: k.delivered_at ? String(k.delivered_at) : null, key: { id: String(k.id), key_value: String(k.key_value), status: String(k.status), expires_at: k.expires_at ? String(k.expires_at) : null, hwid: (k.hwid as string | null) ?? null, activated_at: k.activated_at ? String(k.activated_at) : null, duration_days: num(k.duration_days) } })),
      discounts: discounts.map((d) => ({ code: String(d.code_snapshot ?? "indirim"), amount: num(d.discount_try) ?? 0 })),
      transactions: txns.map((t) => ({ kind: String(t.kind), amount_try: num(t.amount_try) ?? 0, note: (t.note as string | null) ?? null, created_at: String(t.created_at) })),
      audit: auditRows.map((a) => ({ action: String(a.action), actor_email: (a.actor_email as string | null) ?? null, created_at: String(a.created_at), metadata: a.metadata ? String(a.metadata) : null })),
      customer: profile ? { id: String(profile.id), email: (profile.email as string | null) ?? null, display_name: (profile.display_name as string | null) ?? null,
        created_at: String(profile.created_at), tier: (profile.tier as string | null) ?? null, total_points: num(profile.total_points) ?? 0,
        balance_try: num(wallet?.balance_try) ?? 0, order_count: userOrders.length, total_spent: spent,
        recent_orders: userOrders.map((o) => ({ id: String(o.id), reference_code: String(o.reference_code), status: String(o.status), price_try: num(o.price_try) ?? 0, created_at: String(o.created_at) })) } : null,
    };
  });

export const setOrderAdminNote = createServerFn({ method: "POST" }).middleware([requireAdmin])
  .validator((d: unknown) => z.object({ orderId: z.string().uuid(), note: z.string().max(2000) }).parse(d))
  .handler(async ({ data }) => { await mysqlQuery("UPDATE orders SET admin_note=?,updated_at=NOW() WHERE id=?", [data.note || null, data.orderId]); return { ok: true }; });

export const manualDeliverOrder = createServerFn({ method: "POST" }).middleware([requireAdmin])
  .validator((d: unknown) => z.object({ orderId: z.string().uuid(), payload: z.string().min(1).max(5000), note: z.string().max(500).optional(), durationDays: z.number().int().min(1).max(3650).nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const order = await mysqlOne<Record<string, unknown>>(`SELECT o.user_id,o.status,o.product_id,p.name product_name FROM orders o LEFT JOIN products p ON p.id=o.product_id WHERE o.id=? LIMIT 1`, [data.orderId]);
    if (!order?.user_id || !order.product_id) throw new Error("Sipariş bulunamadı");
    if (["cancelled","rejected"].includes(String(order.status))) throw new Error("İptal/red edilmiş siparişe teslim yapılamaz");
    const keyId = crypto.randomUUID();
    const expires = data.durationDays ? ts(new Date(Date.now() + data.durationDays * 864e5)) : null;
    await mysqlQuery(`INSERT INTO license_keys (id,product_id,key_value,status,assigned_order_id,assigned_at,duration_days,expires_at,created_at) VALUES (?,?,?,'assigned',?,?,?, ?,NOW())`, [keyId, String(order.product_id), data.payload.trim(), data.orderId, ts(), data.durationDays ?? null, expires]);
    await mysqlQuery("INSERT INTO order_keys (id,order_id,license_key_id,delivered_at) VALUES (?,?,?,NOW())", [crypto.randomUUID(), data.orderId, keyId]);
    await mysqlQuery("UPDATE orders SET status='approved',approved_at=COALESCE(approved_at,NOW()),admin_note=COALESCE(?,admin_note),updated_at=NOW() WHERE id=?", [data.note ?? null, data.orderId]);
    await mysqlQuery("INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,'order','Siparişin teslim edildi',?, '/hesabim/lisanslar',NOW())", [crypto.randomUUID(), String(order.user_id), `${String(order.product_name ?? "Ürün")} teslim edildi. Lisanslarım sayfasından görebilirsin.`]);
    await audit(context.userId, context.user.email, "order.manual_deliver", data.orderId, { duration_days: data.durationDays ?? null });
    return { ok: true };
  });

export const partialRefundOrder = createServerFn({ method: "POST" }).middleware([requireAdmin])
  .validator((d: unknown) => z.object({ orderId: z.string().uuid(), amount: z.number().positive(), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const order = await mysqlOne<Record<string, unknown>>(`SELECT o.user_id,o.price_try,COALESCE(d.discount_try,0) discount_try FROM orders o LEFT JOIN (SELECT order_id,SUM(discount_try) discount_try FROM order_discounts GROUP BY order_id)d ON d.order_id=o.id WHERE o.id=?`, [data.orderId]);
    if (!order?.user_id) throw new Error("Sipariş bulunamadı");
    const prior = await mysqlOne<{ total: unknown }>("SELECT COALESCE(SUM(amount_try),0) total FROM wallet_transactions WHERE order_id=? AND kind='refund'", [data.orderId]);
    const final = Math.max(0, (num(order.price_try) ?? 0) - (num(order.discount_try) ?? 0)); const refunded = num(prior?.total) ?? 0;
    if (refunded + data.amount > final) throw new Error(`İade toplamı sipariş tutarını aşamaz (kalan: ${final-refunded})`);
    await mysqlQuery("INSERT INTO wallets(user_id,balance_try,updated_at) VALUES (?,0,NOW()) ON DUPLICATE KEY UPDATE updated_at=updated_at", [String(order.user_id)]);
    await mysqlQuery("UPDATE wallets SET balance_try=balance_try+?,updated_at=NOW() WHERE user_id=?", [data.amount, String(order.user_id)]);
    const wallet = await mysqlOne<{ balance_try: unknown }>("SELECT balance_try FROM wallets WHERE user_id=?", [String(order.user_id)]); const balance = num(wallet?.balance_try) ?? 0;
    await mysqlQuery("INSERT INTO wallet_transactions(id,user_id,kind,amount_try,balance_after,order_id,note,created_by,created_at) VALUES (?,?,'refund',?,?,?,?,?,NOW())", [crypto.randomUUID(), String(order.user_id), data.amount, balance, data.orderId, data.note ?? "Kısmi iade", context.userId]);
    await mysqlQuery("INSERT INTO notifications(id,user_id,type,title,body,link,created_at) VALUES (?,?,'wallet','Kısmi iade yapıldı',?,'/cuzdan',NOW())", [crypto.randomUUID(), String(order.user_id), `₺${data.amount.toFixed(2)} cüzdanına iade edildi.`]);
    await audit(context.userId, context.user.email, "order.partial_refund", data.orderId, { amount_try: data.amount });
    return { ok: true, refunded_try: data.amount, balance_after: balance, remaining_refundable: final-refunded-data.amount };
  });

export const changeOrderProduct = createServerFn({ method: "POST" }).middleware([requireAdmin])
  .validator((d: unknown) => z.object({ orderId: z.string().uuid(), productId: z.string().uuid(), note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const [order, product] = await Promise.all([mysqlOne<Record<string, unknown>>("SELECT user_id,product_id,price_try,paid_with FROM orders WHERE id=?", [data.orderId]), mysqlOne<Record<string, unknown>>("SELECT id,name,price_try FROM products WHERE id=?", [data.productId])]);
    if (!order?.user_id) throw new Error("Sipariş bulunamadı"); if (!product) throw new Error("Ürün bulunamadı"); if (String(order.product_id) === data.productId) throw new Error("Sipariş zaten bu üründe");
    const diff = (num(order.price_try) ?? 0) - (num(product.price_try) ?? 0); const walletDelta = order.paid_with === "wallet" ? diff : 0;
    if (walletDelta < 0) { const wallet = await mysqlOne<{ balance_try: unknown }>("SELECT balance_try FROM wallets WHERE user_id=?", [String(order.user_id)]); if ((num(wallet?.balance_try) ?? 0) < Math.abs(walletDelta)) throw new Error("Müşteri bakiyesi ürün farkı için yetersiz"); }
    await mysqlQuery("UPDATE orders SET product_id=?,price_try=?,admin_note=COALESCE(?,admin_note),updated_at=NOW() WHERE id=?", [data.productId, num(product.price_try) ?? 0, data.note ?? null, data.orderId]);
    if (walletDelta !== 0) { await mysqlQuery("UPDATE wallets SET balance_try=balance_try+?,updated_at=NOW() WHERE user_id=?", [walletDelta, String(order.user_id)]); const wallet = await mysqlOne<{balance_try: unknown}>("SELECT balance_try FROM wallets WHERE user_id=?", [String(order.user_id)]); await mysqlQuery("INSERT INTO wallet_transactions(id,user_id,kind,amount_try,balance_after,order_id,note,created_by,created_at) VALUES (?,?,?,?,?,?, 'Sipariş ürün değişimi farkı',?,NOW())", [crypto.randomUUID(), String(order.user_id), walletDelta > 0 ? "refund" : "purchase", Math.abs(walletDelta), num(wallet?.balance_try) ?? 0, data.orderId, context.userId]); }
    await mysqlQuery("INSERT INTO notifications(id,user_id,type,title,body,link,created_at) VALUES (?,?,'order','Siparişin güncellendi',?,'/hesabim',NOW())", [crypto.randomUUID(), String(order.user_id), `Siparişin “${String(product.name)}” ürününe taşındı.`]);
    await audit(context.userId, context.user.email, "order.change_product", data.orderId, { product_id: data.productId, wallet_delta: walletDelta });
    return { ok: true, wallet_delta: walletDelta };
  });

export const messageOrderCustomer = createServerFn({ method: "POST" }).middleware([requireAdmin])
  .validator((d: unknown) => z.object({ orderId: z.string().uuid(), title: z.string().min(1).max(120), body: z.string().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => { const order = await mysqlOne<{user_id:string;reference_code:string}>("SELECT user_id,reference_code FROM orders WHERE id=?", [data.orderId]); if (!order?.user_id) throw new Error("Sipariş sahibi bulunamadı"); await mysqlQuery("INSERT INTO notifications(id,user_id,type,title,body,link,created_at) VALUES (?,?,'order',?,?,'/hesabim',NOW())", [crypto.randomUUID(), order.user_id, data.title, data.body]); await audit(context.userId, context.user.email, "order.message_customer", data.orderId, { reference: order.reference_code }); return { ok: true }; });

export const listProductOptions = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const rows = await mysqlQuery<Record<string, unknown>>("SELECT id,name,price_try,active FROM products ORDER BY name");
  return rows.map((p) => ({ id: String(p.id), name: String(p.name), price_try: num(p.price_try) ?? 0, active: bool(p.active) }));
});
