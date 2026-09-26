import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { requireAuth, requireAdmin } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num, bool } from "./mysql.server";

/* ============ yardımcılar ============ */

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function uid() {
  return crypto.randomUUID();
}

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function genRef() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "SBR-";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function pushNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  link: string | null,
) {
  try {
    await mysqlQuery(
      "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)",
      [uid(), userId, type, title, body, link, ts()],
    );

    const profile = await mysqlOne<{ telegram_chat_id: string | null }>(
      "SELECT telegram_chat_id FROM profiles WHERE id=? LIMIT 1",
      [userId]
    );

    if (profile?.telegram_chat_id) {
      const { sendTelegram } = await import("./telegram.server");
      let tgText = `🔔 *${title}*\n\n${body}`;
      if (link) {
        tgText += `\n\n🔗 [Detayları Gör](https://siberlisans.com${link.startsWith("/") ? link : "/" + link})`;
      }
      await sendTelegram({ chatId: profile.telegram_chat_id, text: tgText });
    }
  } catch (e) {
    console.error("[notify] push", (e as Error).message);
  }
}

type OrderRow = {
  id: string;
  user_id: string | null;
  product_id: string | null;
  price_try: string | number | null;
  reference_code: string | null;
  status: string | null;
  paid_with: string | null;
  checkout_fields: string | null;
};

async function getOrder(orderId: string) {
  return mysqlOne<OrderRow>(
    "SELECT id,user_id,product_id,price_try,reference_code,status,paid_with,checkout_fields FROM orders WHERE id=?",
    [orderId],
  );
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "object") return v as T;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fallback;
  }
}

/** Siparişin ürün listesi (tekil ürün ya da order_items). */
async function orderLines(orderId: string) {
  const items = await mysqlQuery<{ product_id: string; quantity: number }>(
    "SELECT product_id, quantity FROM order_items WHERE order_id=?",
    [orderId],
  );
  if (items.length > 0) {
    return items.map((i) => ({ productId: i.product_id, quantity: Number(i.quantity) || 1 }));
  }
  const o = await mysqlOne<{ product_id: string | null }>(
    "SELECT product_id FROM orders WHERE id=?",
    [orderId],
  );
  return o?.product_id ? [{ productId: o.product_id, quantity: 1 }] : [];
}

/** Sipariş toplamını order_items'tan yeniden hesaplar. */
async function recalcOrderTotal(orderId: string) {
  const row = await mysqlOne<{ total: string | null; cnt: number | null }>(
    "SELECT SUM(unit_price_try*quantity) total, SUM(quantity) cnt FROM order_items WHERE order_id=?",
    [orderId],
  );
  const total = num(row?.total) ?? 0;
  const cnt = Number(row?.cnt ?? 0);
  await mysqlQuery("UPDATE orders SET price_try=?, item_count=?, updated_at=? WHERE id=?", [
    total,
    cnt,
    ts(),
    orderId,
  ]);
  return { total, count: cnt };
}

/** Havuzdan tek bir kullanılabilir anahtar ayırır (yarış korumalı). */
async function assignKeyFromPool(productId: string, orderId: string, durationDays: number | null) {
  const cand = await mysqlOne<{ id: string; key_value: string | null }>(
    "SELECT id,key_value FROM license_keys WHERE product_id=? AND status='available' ORDER BY created_at ASC LIMIT 1",
    [productId],
  );
  if (!cand) return null;
  const token = randomHex(16);
  const expires = durationDays && durationDays > 0 ? ts(new Date(Date.now() + durationDays * 86400_000)) : null;
  const rows = await mysqlQuery<{ affected?: number }>(
    `UPDATE license_keys
        SET status='assigned', assigned_order_id=?, assigned_at=?,
            activation_token=COALESCE(activation_token,?), duration_days=COALESCE(duration_days,?), expires_at=COALESCE(expires_at,?)
      WHERE id=? AND status='available'`,
    [orderId, ts(), token, durationDays, expires, cand.id],
  );
  void rows;
  const check = await mysqlOne<{ status: string | null; assigned_order_id: string | null; activation_token: string | null }>(
    "SELECT status,assigned_order_id,activation_token FROM license_keys WHERE id=?",
    [cand.id],
  );
  if (check?.assigned_order_id !== orderId) return null;
  await mysqlQuery("INSERT INTO order_keys (id,order_id,license_key_id,delivered_at) VALUES (?,?,?,?)", [
    uid(),
    orderId,
    cand.id,
    ts(),
  ]);
  return { id: cand.id, key_value: cand.key_value, activation_token: check?.activation_token ?? token };
}

/** Sipariş satırlarındaki ürünler için havuzdan anahtar ata. */
async function fulfillOrderKeys(orderId: string) {
  const lines = await orderLines(orderId);
  let firstKey: string | null = null;
  let firstToken: string | null = null;
  for (const line of lines) {
    const p = await mysqlOne<{
      manual_fulfillment: number | null;
      unlimited_stock: number | null;
      default_license_days: number | null;
    }>("SELECT manual_fulfillment, unlimited_stock, default_license_days FROM products WHERE id=?", [
      line.productId,
    ]);
    if (!p || bool(p.manual_fulfillment) || bool(p.unlimited_stock)) continue;
    const days = p.default_license_days != null ? Number(p.default_license_days) : 30;
    for (let i = 0; i < line.quantity; i++) {
      const assigned = await assignKeyFromPool(line.productId, orderId, days);
      if (!assigned) break;
      if (!firstKey) {
        firstKey = assigned.key_value;
        firstToken = assigned.activation_token;
      }
    }
  }
  return { licenseKey: firstKey, activationToken: firstToken };
}

/** Cüzdana iade (sipariş net tutarı). */
async function refundOrderToWallet(orderId: string) {
  const ord = await getOrder(orderId);
  if (!ord?.user_id) return 0;
  const disc = await mysqlOne<{ d: string | null }>(
    "SELECT SUM(discount_try) d FROM order_discounts WHERE order_id=?",
    [orderId],
  );
  const net = Math.max(0, (num(ord.price_try) ?? 0) - (num(disc?.d) ?? 0));
  if (net <= 0) return 0;
  await mysqlQuery(
    `INSERT INTO wallets (user_id,balance_try,updated_at) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE balance_try=balance_try+VALUES(balance_try), updated_at=VALUES(updated_at)`,
    [ord.user_id, net, ts()],
  );
  const w = await mysqlOne<{ balance_try: string | null }>(
    "SELECT balance_try FROM wallets WHERE user_id=?",
    [ord.user_id],
  );
  await mysqlQuery(
    "INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
    [uid(), ord.user_id, "refund", net, num(w?.balance_try) ?? 0, orderId, "Sipariş iadesi", ts()],
  );
  return net;
}

/* ============ TEKİL SİPARİŞ ============ */

const createOrderInput = z.object({ productId: z.string().uuid() });

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => createOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const email = context.user?.email ?? null;

    const product = await mysqlOne<{
      id: string;
      name: string;
      price_try: string | null;
      active: number | null;
      manual_fulfillment: number | null;
      unlimited_stock: number | null;
      source: string | null;
      external_id: string | null;
      external_price: string | null;
      supplier_out_of_stock: number | null;
    }>(
      `SELECT id,name,price_try,active,manual_fulfillment,unlimited_stock,source,external_id,external_price,supplier_out_of_stock
         FROM products WHERE id=?`,
      [data.productId],
    );
    if (!product || !bool(product.active)) throw new Error("Ürün bulunamadı.");
    if (bool(product.supplier_out_of_stock)) {
      throw new Error(
        `"${product.name}" tedarikçide geçici olarak stokta yok. Stok döndüğünde otomatik olarak tekrar satışa açılacak.`,
      );
    }

    const isUlProduct = product.source === "uniquelisans" && !!product.external_id;
    if (!bool(product.manual_fulfillment) && !bool(product.unlimited_stock) && !isUlProduct) {
      const c = await mysqlOne<{ c: number }>(
        "SELECT COUNT(*) c FROM license_keys WHERE product_id=? AND status='available'",
        [product.id],
      );
      if (!c || Number(c.c) === 0) {
        try {
          const { notifyTelegram, outOfStockAlertMessage } = await import("@/lib/telegram.server");
          await notifyTelegram(
            outOfStockAlertMessage({ productName: product.name, userEmail: email }),
          );
        } catch (e) {
          console.error("[notify] outOfStock", (e as Error).message);
        }
        throw new Error(
          `"${product.name}" şu an stokta yok. Yöneticiye bildirim gönderildi — kısa süre içinde yeniden stoklanacak. Havale ile ön sipariş için destekle iletişime geçebilirsin.`,
        );
      }
    }

    // Uniquelisans canlı stok/bakiye kontrolü (fail-open)
    if (product.source === "uniquelisans" && product.external_id) {
      const { ulCheckAvailability, ulGetBalance, logSupplierCheck } = await import(
        "@/lib/uniquelisans.server"
      );
      try {
        const avail = await ulCheckAvailability(Number(product.external_id));
        if (!avail.ok) {
          await logSupplierCheck({
            user_id: userId,
            product_id: product.id,
            product_name: product.name,
            external_id: product.external_id,
            stock_ok: false,
            stock_count: avail.stock_count ?? null,
            is_stock: avail.is_stock ?? null,
            supplier_amount: avail.amount ?? null,
            blocked: true,
            block_reason: "out_of_stock",
            context: "single_order",
          });
          try {
            const { notifyTelegram, outOfStockAlertMessage } = await import("@/lib/telegram.server");
            await notifyTelegram(
              outOfStockAlertMessage({
                productName: `${product.name} (Uniquelisans)`,
                userEmail: email,
              }),
            );
          } catch {
            /* ignore */
          }
          throw new Error(
            `"${product.name}" tedarikçide (Uniquelisans) şu an stokta yok. Kısa süre içinde tekrar dener misin?`,
          );
        }
        const cost = Number(avail.amount ?? product.external_price ?? 0);
        const bal = cost > 0 ? await ulGetBalance() : null;
        const balanceOk = bal === null || cost <= 0 ? null : bal >= cost;
        if (balanceOk === false) {
          await logSupplierCheck({
            user_id: userId,
            product_id: product.id,
            product_name: product.name,
            external_id: product.external_id,
            stock_ok: true,
            stock_count: avail.stock_count ?? null,
            is_stock: avail.is_stock ?? null,
            supplier_amount: cost,
            balance: bal,
            balance_ok: false,
            blocked: true,
            block_reason: "insufficient_balance",
            context: "single_order",
          });
          try {
            const { notifyTelegram } = await import("@/lib/telegram.server");
            await notifyTelegram(
              `⚠️ Uniquelisans bakiyesi yetersiz — ${(bal ?? 0).toFixed(2)} < ${cost.toFixed(2)} · Ürün: ${product.name}`,
            );
          } catch {
            /* ignore */
          }
          throw new Error(
            "Tedarikçi tarafında geçici bir aksaklık var, siparişini biraz sonra tekrar deneyebilir misin? Yöneticiye bildirim gönderildi.",
          );
        }
        await logSupplierCheck({
          user_id: userId,
          product_id: product.id,
          product_name: product.name,
          external_id: product.external_id,
          stock_ok: true,
          stock_count: avail.stock_count ?? null,
          is_stock: avail.is_stock ?? null,
          supplier_amount: cost || null,
          balance: bal,
          balance_ok: balanceOk,
          blocked: false,
          context: "single_order",
        });
      } catch (e) {
        if (e instanceof Error && /Uniquelisans|stokta yok|tedarikçi/i.test(e.message)) throw e;
        console.error("[uniquelisans] preflight", (e as Error).message);
      }
    }

    const referenceCode = genRef();
    const orderId = uid();
    const { requestIp, assertIpNotBlocked } = await import("./ip-guard.server");
    const clientIp = requestIp();
    await assertIpNotBlocked(clientIp);
    const clientUa = getRequestHeader("user-agent") ?? null;
    await mysqlQuery(
      `INSERT INTO orders (id,user_id,product_id,price_try,reference_code,status,item_count,client_ip,user_agent,created_at,updated_at)
       VALUES (?,?,?,?,?,'pending',1,?,?,?,?)`,
      [
        orderId,
        userId,
        product.id,
        num(product.price_try) ?? 0,
        referenceCode,
        clientIp,
        clientUa,
        ts(),
        ts(),
      ],
    );

    try {
      await applyFlashDiscountToOrder(orderId, [
        { productId: product.id, quantity: 1, unitPriceTry: num(product.price_try) ?? 0 },
      ]);
    } catch (e) {
      console.error("[flash] apply", (e as Error).message);
    }

    return { orderId, referenceCode };
  });

/* ============ SEPET / ÇOK ÜRÜNLÜ SİPARİŞ ============ */

const cartOrderInput = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
        warranty: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(20),
  couponCode: z.string().trim().min(1).max(50).optional().nullable(),
});

export const createCartOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => cartOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const ids = data.items.map((i) => i.productId);
    const placeholders = ids.map(() => "?").join(",");

    const prods = await mysqlQuery<{
      id: string;
      name: string;
      price_try: string | null;
      active: number | null;
      source: string | null;
      external_id: string | null;
      external_price: string | null;
      supplier_out_of_stock: number | null;
      warranty_price_try: string | null;
      warranty_label: string | null;
    }>(
      `SELECT id,name,price_try,active,source,external_id,external_price,supplier_out_of_stock,warranty_price_try,warranty_label
         FROM products WHERE id IN (${placeholders})`,
      ids,
    );
    if (prods.length === 0) throw new Error("Ürün bulunamadı.");
    const oos = prods.find((p) => bool(p.supplier_out_of_stock));
    if (oos) {
      throw new Error(
        `"${oos.name}" tedarikçide geçici olarak stokta yok. Sepetten çıkarıp daha sonra tekrar deneyebilirsin.`,
      );
    }

    // Uniquelisans ön-kontrol (fail-open)
    try {
      const ulProds = prods.filter((p) => p.source === "uniquelisans" && p.external_id);
      if (ulProds.length > 0) {
        const { ulCheckAvailability, ulGetBalance, logSupplierCheck } = await import(
          "@/lib/uniquelisans.server"
        );
        let totalCost = 0;
        const checked: Array<{
          p: (typeof ulProds)[number];
          amount: number;
          stock_count: number | null;
          is_stock: boolean | null;
        }> = [];
        for (const p of ulProds) {
          const qty = data.items.find((i) => i.productId === p.id)?.quantity ?? 1;
          const avail = await ulCheckAvailability(Number(p.external_id));
          if (!avail.ok) {
            await logSupplierCheck({
              user_id: userId,
              product_id: p.id,
              product_name: p.name,
              external_id: p.external_id,
              stock_ok: false,
              stock_count: avail.stock_count ?? null,
              is_stock: avail.is_stock ?? null,
              supplier_amount: avail.amount ?? null,
              blocked: true,
              block_reason: "out_of_stock",
              context: "cart_order",
            });
            throw new Error(
              `"${p.name}" tedarikçide (Uniquelisans) şu an stokta yok. Sepetten çıkarıp tekrar dener misin?`,
            );
          }
          const amt = Number(avail.amount ?? p.external_price ?? 0);
          totalCost += amt * qty;
          checked.push({
            p,
            amount: amt,
            stock_count: avail.stock_count ?? null,
            is_stock: avail.is_stock ?? null,
          });
        }
        const bal = totalCost > 0 ? await ulGetBalance() : null;
        const balanceOk = bal === null || totalCost <= 0 ? null : bal >= totalCost;
        if (balanceOk === false) {
          try {
            const { notifyTelegram } = await import("@/lib/telegram.server");
            await notifyTelegram(
              `⚠️ Uniquelisans bakiyesi yetersiz (sepet) — ${(bal ?? 0).toFixed(2)} < ${totalCost.toFixed(2)}`,
            );
          } catch {
            /* ignore */
          }
          throw new Error(
            "Tedarikçi tarafında geçici bir aksaklık var, sepetini biraz sonra tekrar deneyebilir misin?",
          );
        }
        for (const c of checked) {
          await logSupplierCheck({
            user_id: userId,
            product_id: c.p.id,
            product_name: c.p.name,
            external_id: c.p.external_id,
            stock_ok: true,
            stock_count: c.stock_count,
            is_stock: c.is_stock,
            supplier_amount: c.amount || null,
            balance: bal,
            balance_ok: balanceOk,
            blocked: false,
            context: "cart_order",
          });
        }
      }
    } catch (e) {
      if (e instanceof Error && /stokta yok|tedarikçi/i.test(e.message)) throw e;
      console.error("[uniquelisans] cart preflight", (e as Error).message);
    }

    const priceMap = new Map(prods.map((p) => [p.id, num(p.price_try) ?? 0]));
    const nameMap = new Map(prods.map((p) => [p.id, p.name]));
    const warrantyMap = new Map(prods.map((p) => [p.id, { price: num(p.warranty_price_try) ?? 0, label: p.warranty_label }]));
    const warrantyFor = (it: { productId: string; warranty?: boolean }) => {
      const w = warrantyMap.get(it.productId);
      return it.warranty && w && w.price > 0 ? w : null;
    };
    const unitFor = (it: { productId: string; warranty?: boolean }) =>
      (priceMap.get(it.productId) ?? 0) + (warrantyFor(it)?.price ?? 0);
    let total = 0;
    let itemCount = 0;
    for (const it of data.items) {
      total += unitFor(it) * it.quantity;
      itemCount += it.quantity;
    }
    total = Math.round(total * 100) / 100;

    const orderId = uid();
    const referenceCode = genRef();
    const ipGuard = await import("./ip-guard.server");
    const cartIp = ipGuard.requestIp();
    await ipGuard.assertIpNotBlocked(cartIp);
    const cartUa = getRequestHeader("user-agent") ?? null;
    const firstProduct = data.items[0]?.productId ?? null;

    await mysqlQuery(
      `INSERT INTO orders (id,user_id,product_id,price_try,reference_code,status,item_count,client_ip,user_agent,created_at,updated_at)
       VALUES (?,?,?,?,?,'pending',?,?,?,?,?)`,
      [orderId, userId, firstProduct, total, referenceCode, itemCount, cartIp, cartUa, ts(), ts()],
    );
    for (const it of data.items) {
      await mysqlQuery(
        `INSERT INTO order_items (id,order_id,product_id,quantity,unit_price_try,product_name_snapshot,warranty,warranty_price_try,warranty_label,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          uid(),
          orderId,
          it.productId,
          it.quantity,
          unitFor(it),
          warrantyFor(it)
            ? `${nameMap.get(it.productId) ?? ""} + GARANTİ${warrantyFor(it)!.label ? ` (${warrantyFor(it)!.label})` : ""}`
            : nameMap.get(it.productId) ?? null,
          !!warrantyFor(it),
          warrantyFor(it)?.price ?? 0,
          warrantyFor(it)?.label ?? null,
          ts(),
        ],
      );
    }

    // Kupon
    if (data.couponCode) {
      try {
        await applyPromoToOrder(orderId, data.couponCode);
      } catch (e) {
        console.error("[coupon] cart", (e as Error).message);
      }
    }

    try {
      await applyFlashDiscountToOrder(
        orderId,
        data.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPriceTry: priceMap.get(i.productId) ?? 0,
        })),
      );
    } catch (e) {
      console.error("[flash] apply cart", (e as Error).message);
    }

    return { orderId, referenceCode, totalTry: total };
  });

/* ============ MÜŞTERİ İŞLEMLERİ ============ */

const markPaidInput = z.object({ orderId: z.string().uuid(), receiptPath: z.string().min(1) });

export const markOrderPaid = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => markPaidInput.parse(d))
  .handler(async ({ data, context }) => {
    await mysqlQuery(
      "UPDATE orders SET receipt_path=?, status='reviewing', updated_at=? WHERE id=? AND user_id=?",
      [data.receiptPath, ts(), data.orderId, context.userId],
    );
    try {
      const o = await mysqlOne<{ reference_code: string; price_try: string | null; name: string | null }>(
        `SELECT o.reference_code, o.price_try, p.name
           FROM orders o LEFT JOIN products p ON p.id=o.product_id WHERE o.id=?`,
        [data.orderId],
      );
      if (o) {
        const { notifyTelegram, receiptUploadedMessage } = await import("@/lib/telegram.server");
        await notifyTelegram(
          receiptUploadedMessage({
            reference: o.reference_code,
            productName: o.name ?? "—",
            priceTry: num(o.price_try) ?? 0,
            userEmail: context.user?.email ?? null,
          }),
        );
      }
    } catch (e) {
      console.error("[notify] markOrderPaid", (e as Error).message);
    }
    return { ok: true };
  });

const noteInput = z.object({ orderId: z.string().uuid(), note: z.string().min(1).max(1000) });

export const setOrderUserNote = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => noteInput.parse(d))
  .handler(async ({ data, context }) => {
    await mysqlQuery("UPDATE orders SET user_note=?, updated_at=? WHERE id=? AND user_id=?", [
      data.note,
      ts(),
      data.orderId,
      context.userId,
    ]);
    return { ok: true };
  });

const checkoutFieldsInput = z.object({
  orderId: z.string().uuid(),
  fields: z.record(z.string(), z.string().max(2000)),
});

export const setOrderCheckoutFields = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => checkoutFieldsInput.parse(d))
  .handler(async ({ data, context }) => {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.fields)) {
      const key = String(k).trim().slice(0, 64);
      const val = String(v ?? "").trim().slice(0, 2000);
      if (key && val) clean[key] = val;
    }
    await mysqlQuery("UPDATE orders SET checkout_fields=?, updated_at=? WHERE id=? AND user_id=?", [
      JSON.stringify(clean),
      ts(),
      data.orderId,
      context.userId,
    ]);
    return { ok: true };
  });

/* ============ DÜŞÜK STOK BİLDİRİMİ ============ */

export async function notifyLowStockForOrder(orderId: string): Promise<void> {
  try {
    const lines = await orderLines(orderId);
    for (const line of lines) {
      const row = await mysqlOne<{
        name: string;
        low_stock_threshold: number | null;
        available: number;
      }>(
        `SELECT p.name, p.low_stock_threshold,
                (SELECT COUNT(*) FROM license_keys k WHERE k.product_id=p.id AND k.status='available') available
           FROM products p WHERE p.id=?`,
        [line.productId],
      );
      if (!row) continue;
      const threshold = Number(row.low_stock_threshold ?? 0);
      const available = Number(row.available ?? 0);
      if (threshold > 0 && available <= threshold) {
        const { notifyTelegram, lowStockAlertMessage } = await import("@/lib/telegram.server");
        await notifyTelegram(
          lowStockAlertMessage({ productName: row.name ?? "—", available, threshold }),
        );
      }
    }
  } catch (e) {
    console.error("[notify] lowStock", (e as Error).message);
  }
}

/* ============ ADMIN: ONAY / RED ============ */

const approveInput = z.object({ orderId: z.string().uuid() });

export const approveOrder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => approveInput.parse(d))
  .handler(async ({ data }) => {
    const ord = await mysqlOne<{
      id: string;
      user_id: string | null;
      reference_code: string | null;
      status: string | null;
      product_id: string | null;
      checkout_fields: string | null;
      price_try: string | null;
      p_id: string | null;
      p_name: string | null;
      p_source: string | null;
      p_external_id: string | null;
      p_required_fields: string | null;
    }>(
      `SELECT o.id,o.user_id,o.reference_code,o.status,o.product_id,o.checkout_fields,o.price_try,
              p.id p_id, p.name p_name, p.source p_source, p.external_id p_external_id, p.required_fields p_required_fields
         FROM orders o LEFT JOIN products p ON p.id=o.product_id WHERE o.id=?`,
      [data.orderId],
    );
    if (!ord) throw new Error("Sipariş bulunamadı.");

    if (ord.p_source === "uniquelisans" && ord.p_external_id && ord.p_id) {
      if (ord.status === "approved") throw new Error("Sipariş zaten onaylı.");
      const required = parseJson<Array<{ name: string; required?: boolean }>>(ord.p_required_fields, []);
      const supplied = parseJson<Record<string, string>>(ord.checkout_fields, {});
      const missing = required
        .filter((r) => r?.required !== false)
        .map((r) => r.name)
        .filter((n) => !supplied[n] || String(supplied[n]).trim() === "");
      if (missing.length > 0) {
        throw new Error(
          `Müşteri gerekli bilgileri girmemiş: ${missing.join(", ")}. Onaylamadan önce müşteriden istemelisin.`,
        );
      }

      // Havuz önceliği — API çağırmadan yerel anahtarla teslim
      const pooled = await assignKeyFromPool(ord.p_id, data.orderId, 30);
      if (pooled) {
        await mysqlQuery(
          `UPDATE orders SET status='approved', approved_at=?, external_delivery_data=?, external_status='pool',
                  admin_note='Havuzdan otomatik teslim (UL API çağrılmadı).', updated_at=? WHERE id=?`,
          [ts(), pooled.key_value, ts(), data.orderId],
        );
        if (ord.user_id) {
          await pushNotification(
            ord.user_id,
            "order_approved",
            "Siparişin onaylandı 🎉",
            `Ref: ${ord.reference_code} · Bilgilerin hesabında hazır.`,
            "/hesabim",
          );
        }
        try {
          const { notifyTelegram } = await import("@/lib/telegram.server");
          await notifyTelegram(`✅ Havuzdan teslim (UL ürünü) — Ref: ${ord.reference_code}`);
        } catch {
          /* ignore */
        }
        return { ok: true, source: "pool" as const };
      }

      const { ulBuy } = await import("@/lib/uniquelisans.server");
      let resp;
      try {
        resp = await ulBuy(Number(ord.p_external_id), supplied);
      } catch (e) {
        await mysqlQuery("UPDATE orders SET status='reviewing', admin_note=?, updated_at=? WHERE id=?", [
          `API hatası: ${(e as Error).message}`,
          ts(),
          data.orderId,
        ]);
        try {
          const { notifyTelegram } = await import("@/lib/telegram.server");
          await notifyTelegram(
            `⚠️ Uniquelisans otomatik alım başarısız — Ref: ${ord.reference_code} · ${(e as Error).message}`,
          );
        } catch {
          /* ignore */
        }
        throw new Error(
          `Uniquelisans API'ye ulaşılamadı: ${(e as Error).message}. Sipariş 'inceleniyor' bırakıldı.`,
        );
      }

      if (
        resp.status === "error" ||
        resp.code === 402 ||
        resp.code === 422 ||
        (resp.code === 200 && resp.status !== "success" && resp.status !== "pending")
      ) {
        const msg =
          resp.message ||
          (resp.required_fields
            ? `Eksik alanlar: ${Object.keys(resp.required_fields).join(", ")}`
            : "bilinmeyen hata");
        await mysqlQuery(
          "UPDATE orders SET status='reviewing', admin_note=?, external_status=?, updated_at=? WHERE id=?",
          [`Uniquelisans: ${msg}`, resp.status ?? null, ts(), data.orderId],
        );
        try {
          const { notifyTelegram } = await import("@/lib/telegram.server");
          await notifyTelegram(`⚠️ Uniquelisans otomatik alım hatası — Ref: ${ord.reference_code} · ${msg}`);
        } catch {
          /* ignore */
        }
        throw new Error(`Uniquelisans: ${msg}. Sipariş 'inceleniyor' bırakıldı, manuel devam edebilirsin.`);
      }

      if (resp.status === "pending") {
        await mysqlQuery(
          `UPDATE orders SET external_order_id=?, external_status='pending',
                  admin_note='Uniquelisans: stok yok, tedarikçi hazırlıyor (pending).', updated_at=? WHERE id=?`,
          [resp.order_id ? String(resp.order_id) : null, ts(), data.orderId],
        );
        try {
          const { notifyTelegram } = await import("@/lib/telegram.server");
          await notifyTelegram(
            `⏳ Uniquelisans stok yok/beklemede — Ref: ${ord.reference_code} · ext order: ${resp.order_id}`,
          );
        } catch {
          /* ignore */
        }
        throw new Error(
          "Uniquelisans stoğu şu an yok — tedarikçi 'pending' verdi. Sipariş 'inceleniyor' kalıyor.",
        );
      }

      const deliveryData = (resp.delivery_data ?? "").toString().trim();
      if (!deliveryData) throw new Error("Uniquelisans teslim verisi boş döndü.");

      const keyId = uid();
      await mysqlQuery(
        `INSERT INTO license_keys (id,product_id,key_value,status,assigned_order_id,assigned_at,created_at)
         VALUES (?,?,?,'assigned',?,?,?)`,
        [keyId, ord.p_id, deliveryData, data.orderId, ts(), ts()],
      );
      await mysqlQuery(
        "INSERT INTO order_keys (id,order_id,license_key_id,delivered_at) VALUES (?,?,?,?)",
        [uid(), data.orderId, keyId, ts()],
      );
      await mysqlQuery(
        `UPDATE orders SET status='approved', approved_at=?, external_order_id=?, external_delivery_data=?,
                external_status='success', updated_at=? WHERE id=?`,
        [ts(), resp.order_id ? String(resp.order_id) : null, deliveryData, ts(), data.orderId],
      );
      if (ord.user_id) {
        await pushNotification(
          ord.user_id,
          "order_approved",
          "Siparişin onaylandı 🎉",
          `Ref: ${ord.reference_code} · Bilgilerin hesabında hazır.`,
          "/hesabim",
        );
      }
      return { ok: true, licenseKey: deliveryData, activationToken: null };
    }

    // Standart yol — yerel havuzdan ata
    if (ord.status === "approved") throw new Error("Sipariş zaten onaylı.");
    const res = await fulfillOrderKeys(data.orderId);
    await mysqlQuery("UPDATE orders SET status='approved', approved_at=?, updated_at=? WHERE id=?", [
      ts(),
      ts(),
      data.orderId,
    ]);
    await notifyLowStockForOrder(data.orderId);

    if (ord.user_id) {
      await pushNotification(
        ord.user_id,
        "order_approved",
        "Siparişin onaylandı 🎉",
        `Ref: ${ord.reference_code} · Anahtarların hesabında hazır.`,
        "/hesabim",
      );
    }
    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      await notifyTelegram(
        `🎉 <b>Sipariş onaylandı</b>\n📦 ${ord.p_name ?? "—"}\n💰 ₺${(num(ord.price_try) ?? 0).toLocaleString("tr-TR")}\n🔖 <code>${ord.reference_code ?? ""}</code>`,
      );
    } catch (e) {
      console.error("[tg] approveOrder", (e as Error).message);
    }

    return { ok: true, licenseKey: res.licenseKey, activationToken: res.activationToken };
  });

const rejectInput = z.object({ orderId: z.string().uuid(), note: z.string().max(500).optional() });

export const rejectOrder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => rejectInput.parse(d))
  .handler(async ({ data }) => {
    const ord = await getOrder(data.orderId);
    let refunded = false;
    if (ord?.paid_with === "wallet" && ord.status !== "rejected") {
      const amount = await refundOrderToWallet(data.orderId);
      refunded = amount > 0;
    }
    await mysqlQuery("UPDATE orders SET status='rejected', admin_note=?, updated_at=? WHERE id=?", [
      data.note ?? null,
      ts(),
      data.orderId,
    ]);
    return { ok: true, refunded };
  });

const finalizeFreeInput = z.object({ orderId: z.string().uuid() });

export const finalizeFreeOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => finalizeFreeInput.parse(d))
  .handler(async ({ data, context }) => {
    const ord = await getOrder(data.orderId);
    if (!ord) throw new Error("Sipariş bulunamadı.");
    if (ord.user_id !== context.userId && !context.isAdmin) throw new Error("Yetkisiz.");
    if (ord.status === "approved") throw new Error("Sipariş zaten onaylı.");

    const disc = await mysqlOne<{ d: string | null }>(
      "SELECT SUM(discount_try) d FROM order_discounts WHERE order_id=?",
      [data.orderId],
    );
    const net = (num(ord.price_try) ?? 0) - (num(disc?.d) ?? 0);
    if (net > 0.009) throw new Error("Sipariş ücretsiz değil.");

    const res = await fulfillOrderKeys(data.orderId);
    await mysqlQuery(
      "UPDATE orders SET status='approved', approved_at=?, paid_with='free', updated_at=? WHERE id=?",
      [ts(), ts(), data.orderId],
    );
    await notifyLowStockForOrder(data.orderId);
    if (ord.user_id) {
      await pushNotification(
        ord.user_id,
        "order_approved",
        "Siparişin onaylandı 🎉",
        `Ref: ${ord.reference_code} · Anahtarların hesabında hazır.`,
        "/hesabim",
      );
    }
    return { ok: true, licenseKey: res.licenseKey, activationToken: res.activationToken };
  });

/* ============ ADMIN: ANAHTAR / ÜRÜN / BANKA ============ */

const importKeysInput = z.object({
  productId: z.string().uuid(),
  keys: z.array(z.string().min(4).max(4000)).min(1).max(2000),
  sharedCount: z.number().int().min(0).max(100000).optional(),
});

export const importLicenseKeys = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => importKeysInput.parse(d))
  .handler(async ({ data }) => {
    const uniqueKeys = [...new Set(data.keys.map((k) => k.trim()).filter(Boolean))];
    if (uniqueKeys.length === 0) return { inserted: 0, submitted: 0 };

    const shared = Math.max(0, Math.floor(data.sharedCount ?? 0));
    if (shared > 0) {
      let inserted = 0;
      for (const key_value of uniqueKeys) {
        for (let i = 0; i < shared; i++) {
          await mysqlQuery(
            `INSERT INTO license_keys (id,product_id,key_value,status,is_shared,created_at) VALUES (?,?,?,'available',1,?)`,
            [uid(), data.productId, key_value, ts()],
          );
          inserted++;
        }
      }
      return { inserted, submitted: uniqueKeys.length * shared };
    }

    const ph = uniqueKeys.map(() => "?").join(",");
    const existing = await mysqlQuery<{ key_value: string }>(
      `SELECT key_value FROM license_keys WHERE product_id=? AND (is_shared IS NULL OR is_shared=0) AND key_value IN (${ph})`,
      [data.productId, ...uniqueKeys],
    );
    const already = new Set(existing.map((r) => r.key_value));
    let inserted = 0;
    for (const key_value of uniqueKeys) {
      if (already.has(key_value)) continue;
      await mysqlQuery(
        `INSERT INTO license_keys (id,product_id,key_value,status,created_at) VALUES (?,?,?,'available',?)`,
        [uid(), data.productId, key_value, ts()],
      );
      inserted++;
    }
    return { inserted, submitted: uniqueKeys.length };
  });

const productInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/),
  description: z.string().max(1000).optional(),
  duration: z.enum(["hourly", "daily", "weekly", "monthly", "yearly", "lifetime"]),
  delivery_type: z.enum(["key", "account", "link", "link_token"]).default("key"),
  price_try: z.number().min(0).max(1000000),
  cost_try: z.number().min(0).max(1000000).optional().nullable(),
  active: z.boolean(),
  category: z.string().max(80).optional().nullable(),
  manual_fulfillment: z.boolean().optional(),
  stock_hint: z.number().int().min(0).max(100000).optional().nullable(),
  low_stock_threshold: z.number().int().min(0).max(10000).optional(),
  featured: z.boolean().optional(),
  unlimited_stock: z.boolean().optional(),
  sort_order: z.number().int().min(-9999).max(9999).optional(),
  tier: z.enum(["standard", "epic"]).optional(),
  image_url: z
    .union([z.string().url().max(500), z.string().max(0), z.string().regex(/^\/[\w\-\/.]+$/)])
    .optional()
    .nullable(),
  shopier_url: z.union([z.string().url().max(500), z.string().max(0)]).optional().nullable(),
  requires_email: z.boolean().optional(),
  demo_video_url: z.union([z.string().url().max(500), z.string().max(0)]).optional().nullable(),
  grants_app: z.union([z.string().max(40), z.null()]).optional(),
  grants_app_days: z.union([z.number().int().min(0).max(36500), z.null()]).optional(),
});

type SqlVal = string | number | boolean | null;

function toSqlValue(v: unknown): SqlVal {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "string") return v;
  return JSON.stringify(v);
}

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => productInput.parse(d))
  .handler(async ({ data }) => {
    const isNew = !data.id;
    const { id, ...fields } = data;
    const cols = Object.keys(fields).filter((k) => fields[k as keyof typeof fields] !== undefined);
    const vals = cols.map((k) => toSqlValue(fields[k as keyof typeof fields]));

    if (id) {
      await mysqlQuery(
        `UPDATE products SET ${cols.map((c) => `${c}=?`).join(",")}, updated_at=? WHERE id=?`,
        [...vals, ts(), id],
      );
    } else {
      await mysqlQuery(
        `INSERT INTO products (id,${cols.join(",")},created_at,updated_at)
         VALUES (?,${cols.map(() => "?").join(",")},?,?)`,
        [uid(), ...vals, ts(), ts()],
      );
    }

    if (isNew && data.active) {
      try {
        const tg = await import("@/lib/telegram.server");
        await tg.postToChannel(
          tg.productAnnouncement({
            name: data.name,
            slug: data.slug,
            priceTry: Number(data.price_try),
            description: data.description ?? null,
            category: data.category ?? null,
            imageUrl: data.image_url ?? null,
          }),
        );
      } catch (e) {
        console.error("[notify] newProduct", (e as Error).message);
      }
    }
    return { ok: true };
  });

const deleteProductInput = z.object({ id: z.string().uuid() });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => deleteProductInput.parse(d))
  .handler(async ({ data }) => {
    await mysqlQuery("DELETE FROM products WHERE id=?", [data.id]);
    return { ok: true };
  });

const bankInput = z.object({
  id: z.string().uuid().optional(),
  bank_name: z.string().min(2).max(120),
  iban: z.string().min(10).max(64),
  holder_name: z.string().min(2).max(120),
  active: z.boolean(),
});

export type BankAccountRow = {
  id: string;
  bank_name: string;
  iban: string;
  holder_name: string;
  active: boolean;
};

export const listBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<BankAccountRow[]> => {
    const rows = await mysqlQuery<{
      id: string;
      bank_name: string;
      iban: string;
      holder_name: string;
      active: number;
    }>("SELECT id, bank_name, iban, holder_name, active FROM bank_accounts ORDER BY created_at");
    return rows.map((r) => ({
      id: r.id,
      bank_name: r.bank_name,
      iban: r.iban,
      holder_name: r.holder_name,
      active: bool(r.active),
    }));
  });

export const upsertBankAccount = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => bankInput.parse(d))
  .handler(async ({ data }) => {
    if (data.id) {
      await mysqlQuery(
        "UPDATE bank_accounts SET bank_name=?, iban=?, holder_name=?, active=? WHERE id=?",
        [data.bank_name, data.iban, data.holder_name, data.active ? 1 : 0, data.id],
      );
    } else {
      await mysqlQuery(
        "INSERT INTO bank_accounts (id,bank_name,iban,holder_name,active,created_at) VALUES (?,?,?,?,?,?)",
        [uid(), data.bank_name, data.iban, data.holder_name, data.active ? 1 : 0, ts()],
      );
    }
    return { ok: true };
  });

/* ============ KUPONLAR ============ */

async function applyPromoToOrder(orderId: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  const ord = await getOrder(orderId);
  if (!ord) throw new Error("Sipariş bulunamadı.");
  if (ord.status === "approved") throw new Error("Onaylanmış siparişe kupon uygulanamaz.");

  const promo = await mysqlOne<{
    id: string;
    code: string;
    discount_type: string;
    discount_value: string | null;
    active: number | null;
    max_uses: number | null;
    used_count: number | null;
    expires_at: string | null;
    product_id: string | null;
    min_amount: string | null;
  }>(
    `SELECT id,code,discount_type,discount_value,active,max_uses,used_count,expires_at,product_id,min_amount
       FROM promo_codes WHERE UPPER(code)=? LIMIT 1`,
    [code],
  );
  if (!promo || !bool(promo.active)) throw new Error("Kupon geçersiz.");
  if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) {
    throw new Error("Kuponun süresi dolmuş.");
  }
  if (promo.max_uses != null && Number(promo.used_count ?? 0) >= Number(promo.max_uses)) {
    throw new Error("Kupon kullanım limiti dolmuş.");
  }

  const total = num(ord.price_try) ?? 0;
  if (promo.min_amount && total < (num(promo.min_amount) ?? 0)) {
    throw new Error(`Bu kupon için minimum tutar ₺${num(promo.min_amount)}.`);
  }
  if (promo.product_id) {
    const lines = await orderLines(orderId);
    if (!lines.some((l) => l.productId === promo.product_id)) {
      throw new Error("Kupon bu ürün için geçerli değil.");
    }
  }

  const value = num(promo.discount_value) ?? 0;
  const raw = promo.discount_type === "percent" ? (total * value) / 100 : value;
  const discount = Math.round(Math.max(0, Math.min(total, raw)) * 100) / 100;
  if (discount <= 0) throw new Error("Kupon indirim sağlamıyor.");

  await mysqlQuery("DELETE FROM order_discounts WHERE order_id=? AND promo_code_id IS NOT NULL", [orderId]);
  await mysqlQuery(
    "INSERT INTO order_discounts (id,order_id,promo_code_id,code_snapshot,discount_try,created_at) VALUES (?,?,?,?,?,?)",
    [uid(), orderId, promo.id, promo.code, discount, ts()],
  );
  await mysqlQuery("UPDATE promo_codes SET used_count=COALESCE(used_count,0)+1 WHERE id=?", [promo.id]);

  const sum = await mysqlOne<{ d: string | null }>(
    "SELECT SUM(discount_try) d FROM order_discounts WHERE order_id=?",
    [orderId],
  );
  const finalPrice = Math.max(0, Math.round((total - (num(sum?.d) ?? 0)) * 100) / 100);
  return { discountTry: discount, finalPrice, code: promo.code };
}

const applyPromoInput = z.object({
  orderId: z.string().uuid(),
  code: z.string().min(2).max(64),
});

export const applyPromoCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => applyPromoInput.parse(d))
  .handler(async ({ data, context }) => {
    const ord = await getOrder(data.orderId);
    if (!ord || (ord.user_id !== context.userId && !context.isAdmin)) throw new Error("Yetkisiz.");
    return applyPromoToOrder(data.orderId, data.code);
  });

const removePromoInput = z.object({ orderId: z.string().uuid() });

export const removePromoCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => removePromoInput.parse(d))
  .handler(async ({ data, context }) => {
    const ord = await getOrder(data.orderId);
    if (!ord || (ord.user_id !== context.userId && !context.isAdmin)) throw new Error("Yetkisiz.");
    const rows = await mysqlQuery<{ promo_code_id: string | null }>(
      "SELECT promo_code_id FROM order_discounts WHERE order_id=? AND promo_code_id IS NOT NULL",
      [data.orderId],
    );
    await mysqlQuery("DELETE FROM order_discounts WHERE order_id=? AND promo_code_id IS NOT NULL", [
      data.orderId,
    ]);
    for (const r of rows) {
      if (r.promo_code_id) {
        await mysqlQuery(
          "UPDATE promo_codes SET used_count=GREATEST(COALESCE(used_count,1)-1,0) WHERE id=?",
          [r.promo_code_id],
        );
      }
    }
    return { ok: true };
  });

const promoUpsertInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(2).max(64),
  discount_type: z.enum(["percent", "fixed"]),
  discount_value: z.number().min(0).max(1000000),
  active: z.boolean(),
  max_uses: z.number().int().min(1).nullable().optional(),
  expires_at: z.string().nullable().optional(),
  product_id: z.string().uuid().nullable().optional(),
  min_amount: z.number().min(0).default(0),
  note: z.string().max(500).nullable().optional(),
});

export const upsertPromoCode = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => promoUpsertInput.parse(d))
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase().trim();
    const isNew = !data.id;
    const expires = data.expires_at ? ts(new Date(data.expires_at)) : null;
    if (data.id) {
      await mysqlQuery(
        `UPDATE promo_codes SET code=?, discount_type=?, discount_value=?, active=?, max_uses=?, expires_at=?,
                product_id=?, min_amount=?, note=?, updated_at=? WHERE id=?`,
        [
          code,
          data.discount_type,
          data.discount_value,
          data.active ? 1 : 0,
          data.max_uses ?? null,
          expires,
          data.product_id ?? null,
          data.min_amount ?? 0,
          data.note ?? null,
          ts(),
          data.id,
        ],
      );
    } else {
      await mysqlQuery(
        `INSERT INTO promo_codes (id,code,discount_type,discount_value,active,max_uses,used_count,expires_at,product_id,min_amount,note,created_at,updated_at)
         VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?)`,
        [
          uid(),
          code,
          data.discount_type,
          data.discount_value,
          data.active ? 1 : 0,
          data.max_uses ?? null,
          expires,
          data.product_id ?? null,
          data.min_amount ?? 0,
          data.note ?? null,
          ts(),
          ts(),
        ],
      );
    }

    if (isNew && data.active) {
      try {
        let productName: string | null = null;
        let productSlug: string | null = null;
        if (data.product_id) {
          const p = await mysqlOne<{ name: string; slug: string }>(
            "SELECT name,slug FROM products WHERE id=?",
            [data.product_id],
          );
          productName = p?.name ?? null;
          productSlug = p?.slug ?? null;
        }
        const tg = await import("@/lib/telegram.server");
        await tg.postToChannel(
          tg.promoAnnouncement({
            code,
            discountType: data.discount_type,
            discountValue: Number(data.discount_value),
            productName,
            productSlug,
            minAmount: data.min_amount ?? 0,
            expiresAt: data.expires_at ?? null,
            maxUses: data.max_uses ?? null,
          }),
        );
      } catch (e) {
        console.error("[notify] newPromo", (e as Error).message);
      }
    }
    return { ok: true };
  });

export type AdminPromoRow = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  active: boolean;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  product_id: string | null;
  min_amount: number;
  note: string | null;
};

export const listPromoCodesAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<AdminPromoRow[]> => {
    const rows = await mysqlQuery<Record<string, unknown>>(
      "SELECT * FROM promo_codes ORDER BY created_at DESC",
    );
    return rows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      discount_type: r.discount_type as "percent" | "fixed",
      discount_value: num(r.discount_value) ?? 0,
      active: bool(r.active),
      max_uses: r.max_uses === null || r.max_uses === undefined ? null : Number(r.max_uses),
      used_count: Number(r.used_count ?? 0),
      expires_at: (r.expires_at as string | null) ?? null,
      product_id: (r.product_id as string | null) ?? null,
      min_amount: num(r.min_amount) ?? 0,
      note: (r.note as string | null) ?? null,
    }));
  });

export type ProductOptionForPromo = { id: string; name: string };

export const listProductOptionsForPromo = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<ProductOptionForPromo[]> => {
    const rows = await mysqlQuery<{ id: string; name: string }>(
      "SELECT id, name FROM products ORDER BY name",
    );
    return rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
  });

const promoDeleteInput = z.object({ id: z.string().uuid() });

export const deletePromoCode = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => promoDeleteInput.parse(d))
  .handler(async ({ data }) => {
    await mysqlQuery("DELETE FROM promo_codes WHERE id=?", [data.id]);
    return { ok: true };
  });

/* ============ FLASH İNDİRİM ============ */

async function applyFlashDiscountToOrder(
  orderId: string,
  items: Array<{ productId: string; quantity: number; unitPriceTry: number }>,
): Promise<void> {
  if (items.length === 0) return;
  const ids = items.map((i) => i.productId);
  const ph = ids.map(() => "?").join(",");
  const sales = await mysqlQuery<{
    id: string;
    product_id: string;
    discount_type: string;
    discount_value: string | null;
  }>(
    `SELECT id,product_id,discount_type,discount_value FROM flash_sales
      WHERE product_id IN (${ph}) AND is_active=1 AND starts_at <= NOW() AND ends_at > NOW()`,
    ids,
  );
  if (sales.length === 0) return;

  const bestByProduct = new Map<string, { saleId: string; saved: number }>();
  for (const it of items) {
    const applicable = sales.filter((r) => r.product_id === it.productId);
    let best: { saleId: string; saved: number } | null = null;
    for (const r of applicable) {
      const value = num(r.discount_value) ?? 0;
      const raw = r.discount_type === "percent" ? it.unitPriceTry * (value / 100) : value;
      const perUnit = Math.max(0, Math.min(it.unitPriceTry, raw));
      const saved = Math.round(perUnit * it.quantity * 100) / 100;
      if (saved > 0 && (!best || saved > best.saved)) best = { saleId: r.id, saved };
    }
    if (best) bestByProduct.set(it.productId, best);
  }
  for (const [productId, v] of bestByProduct) {
    await mysqlQuery(
      "INSERT INTO order_discounts (id,order_id,product_id,code_snapshot,discount_try,created_at) VALUES (?,?,?,?,?,?)",
      [uid(), orderId, productId, `FLASH-${v.saleId.slice(0, 8)}`, v.saved, ts()],
    );
  }
}

/* ============ SİPARİŞ SATIRLARI ============ */

const addItemInput = z.object({
  orderId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20).default(1),
});

export const addItemToOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => addItemInput.parse(d))
  .handler(async ({ data, context }) => {
    const ord = await getOrder(data.orderId);
    if (!ord || (ord.user_id !== context.userId && !context.isAdmin)) throw new Error("Yetkisiz.");
    if (ord.status !== "pending" && ord.status !== "reviewing") {
      throw new Error("Bu sipariş artık düzenlenemez.");
    }
    const p = await mysqlOne<{ id: string; name: string; price_try: string | null; active: number | null }>(
      "SELECT id,name,price_try,active FROM products WHERE id=?",
      [data.productId],
    );
    if (!p || !bool(p.active)) throw new Error("Ürün bulunamadı.");

    // Tekil sipariş ise önce mevcut ürünü satıra taşı
    const existingItems = await mysqlQuery<{ c: number }>(
      "SELECT COUNT(*) c FROM order_items WHERE order_id=?",
      [data.orderId],
    );
    if (Number(existingItems[0]?.c ?? 0) === 0 && ord.product_id) {
      const base = await mysqlOne<{ name: string; price_try: string | null }>(
        "SELECT name,price_try FROM products WHERE id=?",
        [ord.product_id],
      );
      await mysqlQuery(
        `INSERT INTO order_items (id,order_id,product_id,quantity,unit_price_try,product_name_snapshot,created_at)
         VALUES (?,?,?,1,?,?,?)`,
        [uid(), data.orderId, ord.product_id, num(ord.price_try) ?? num(base?.price_try) ?? 0, base?.name ?? null, ts()],
      );
    }

    const same = await mysqlOne<{ id: string; quantity: number }>(
      "SELECT id,quantity FROM order_items WHERE order_id=? AND product_id=? LIMIT 1",
      [data.orderId, data.productId],
    );
    if (same) {
      await mysqlQuery("UPDATE order_items SET quantity=quantity+? WHERE id=?", [
        data.quantity,
        same.id,
      ]);
    } else {
      await mysqlQuery(
        `INSERT INTO order_items (id,order_id,product_id,quantity,unit_price_try,product_name_snapshot,created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [uid(), data.orderId, p.id, data.quantity, num(p.price_try) ?? 0, p.name, ts()],
      );
    }

    const { total } = await recalcOrderTotal(data.orderId);
    return { orderId: data.orderId, totalTry: total };
  });

const removeItemInput = z.object({
  orderId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const removeItemFromOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => removeItemInput.parse(d))
  .handler(async ({ data, context }) => {
    const ord = await getOrder(data.orderId);
    if (!ord || (ord.user_id !== context.userId && !context.isAdmin)) throw new Error("Yetkisiz.");
    if (ord.status !== "pending" && ord.status !== "reviewing") {
      throw new Error("Bu sipariş artık düzenlenemez.");
    }
    await mysqlQuery("DELETE FROM order_items WHERE id=? AND order_id=?", [data.itemId, data.orderId]);
    const { total, count } = await recalcOrderTotal(data.orderId);
    return { orderId: data.orderId, totalTry: total, itemsLeft: count };
  });

const cancelOrderInput = z.object({ orderId: z.string().uuid() });

export const cancelPendingOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => cancelOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const ord = await getOrder(data.orderId);
    if (!ord || (ord.user_id !== context.userId && !context.isAdmin)) throw new Error("Yetkisiz.");
    if (ord.status !== "pending" && ord.status !== "reviewing") {
      throw new Error("Sadece bekleyen siparişler iptal edilebilir.");
    }
    await mysqlQuery("UPDATE orders SET status='cancelled', updated_at=? WHERE id=?", [
      ts(),
      data.orderId,
    ]);
    return { ok: true };
  });

const adminCancelInput = z.object({
  orderId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

export const adminCancelOrder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => adminCancelInput.parse(d))
  .handler(async ({ data }) => {
    const ord = await getOrder(data.orderId);
    if (!ord) throw new Error("Sipariş bulunamadı.");
    if (ord.status === "cancelled") return { ok: true, refunded_try: 0, released_keys: 0 };

    let refunded = 0;
    if (ord.paid_with === "wallet") {
      refunded = await refundOrderToWallet(data.orderId);
    }

    const keys = await mysqlQuery<{ license_key_id: string }>(
      "SELECT license_key_id FROM order_keys WHERE order_id=?",
      [data.orderId],
    );
    for (const k of keys) {
      await mysqlQuery(
        `UPDATE license_keys SET status='available', assigned_order_id=NULL, assigned_at=NULL,
                activation_token=NULL, expires_at=NULL WHERE id=?`,
        [k.license_key_id],
      );
    }
    await mysqlQuery("DELETE FROM order_keys WHERE order_id=?", [data.orderId]);
    await mysqlQuery("UPDATE orders SET status='cancelled', admin_note=?, updated_at=? WHERE id=?", [
      data.note ?? null,
      ts(),
      data.orderId,
    ]);
    if (ord.user_id) {
      await pushNotification(
        ord.user_id,
        "order_cancelled",
        "Siparişin iptal edildi",
        `Ref: ${ord.reference_code}${refunded > 0 ? ` · ₺${refunded} bakiyene iade edildi.` : ""}`,
        "/hesabim",
      );
    }
    return { ok: true, refunded_try: refunded, released_keys: keys.length };
  });
