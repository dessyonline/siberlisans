import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { requireAuth, requireAdmin } from "./auth-middleware.server";

// Sabit paketler
export const TOPUP_PACKAGES = [250, 500, 1000, 2000] as const;

function genRef() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "TOP-";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

const createTopupInput = z.object({
  amount: z.number().refine((v) => Number.isFinite(v) && v >= 200 && v <= 1000000, {
    message: "Minimum 200 ₺ yükleyebilirsiniz",
  }),
});

/**
 * ip-api.com üzerinden VPN/hosting tespiti. Fail-open: ağ hatasında
 * `is_vpn=false` döner, meşru kullanıcıyı kilitlemez.
 */
async function detectVpn(ip: string | null): Promise<{ is_vpn: boolean; country: string | null }> {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return { is_vpn: false, country: null };
  }
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 2500);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,proxy,hosting`,
      { signal: ac.signal },
    );
    clearTimeout(to);
    if (!res.ok) return { is_vpn: false, country: null };
    const j = (await res.json()) as { status?: string; country?: string; proxy?: boolean; hosting?: boolean };
    if (j.status !== "success") return { is_vpn: false, country: null };
    return { is_vpn: Boolean(j.proxy) || Boolean(j.hosting), country: j.country ?? null };
  } catch {
    return { is_vpn: false, country: null };
  }
}

export const createTopup = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => createTopupInput.parse(d))
  .handler(async ({ data, context }) => {
    const { mysqlQuery, mysqlOne, num } = await import("./mysql.server");
    const userId = context.userId;

    const active = await mysqlOne<{
      id: string;
      reference_code: string;
      amount_try: unknown;
      status: string;
    }>(
      `SELECT id, reference_code, amount_try, status
         FROM wallet_topups
        WHERE user_id = ? AND status IN ('pending','reviewing')
        ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    if (active) {
      return {
        topupId: active.id,
        referenceCode: active.reference_code,
        reused: true,
        amount: num(active.amount_try) ?? 0,
        status: active.status,
      };
    }

    // Spam koruması: son 10 dakikada yeni talep açılmasın.
    const recent = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM wallet_topups WHERE user_id=? AND created_at >= (NOW() - INTERVAL 10 MINUTE)",
      [userId],
    );
    if (Number(recent?.c ?? 0) >= 3) {
      throw new Error("Çok sık bakiye yükleme talebi oluşturuyorsunuz. Lütfen 10 dakika sonra tekrar deneyin.");
    }

    const ipGuard = await import("./ip-guard.server");
    const ip = ipGuard.requestIp();
    await ipGuard.assertIpNotBlocked(ip);
    const ua = getRequestHeader("user-agent") ?? null;
    const { is_vpn, country } = await detectVpn(ip);
    if (is_vpn) {
      throw new Error("VPN/Proxy üzerinden bakiye yükleme yapılamaz. Gerçek bağlantınızla tekrar deneyin.");
    }

    const id = crypto.randomUUID();
    const reference = genRef();
    await mysqlQuery(
      `INSERT INTO wallet_topups
         (id,user_id,amount_try,reference_code,status,client_ip,user_agent,is_vpn,ip_country,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, userId, data.amount, reference, "pending", ip, ua, is_vpn ? 1 : 0, country, ts(), ts()],
    );

    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      const prof = await mysqlOne<{ email: string | null; display_name: string | null }>(
        "SELECT email, display_name FROM profiles WHERE id=? LIMIT 1",
        [userId],
      );
      const who = prof?.display_name || prof?.email || userId.slice(0, 8);
      await notifyTelegram(
        `🆕 <b>Yeni bakiye yükleme talebi</b>\n` +
          `👤 ${who}\n` +
          `💰 ₺${Number(data.amount).toLocaleString("tr-TR")}\n` +
          `🔖 <code>${reference}</code>\n` +
          `📶 IP: ${ip ?? "?"}${country ? ` (${country})` : ""}`,
      );
    } catch (e) {
      console.error("[tg] createTopup", (e as Error).message);
    }

    return { topupId: id, referenceCode: reference, reused: false, amount: data.amount, status: "pending" };
  });

const markTopupPaidInput = z.object({
  topupId: z.string(),
  receiptPath: z.string().min(1),
});

export const markTopupPaid = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => markTopupPaidInput.parse(d))
  .handler(async ({ data, context }) => {
    const { mysqlQuery, mysqlOne, mysqlExec } = await import("./mysql.server");
    const changed = await mysqlExec(
      "UPDATE wallet_topups SET receipt_path=?, status='reviewing', updated_at=? WHERE id=? AND user_id=? AND status IN ('pending','reviewing')",
      [data.receiptPath, ts(), data.topupId, context.userId],
    );
    if (changed !== 1) {
      const current = await mysqlOne<{ status: string }>(
        "SELECT status FROM wallet_topups WHERE id=? AND user_id=? LIMIT 1",
        [data.topupId, context.userId],
      );
      if (!current) throw new Error("Bakiye yükleme talebi bulunamadı.");
      if (current.status === "approved") throw new Error("Bu bakiye talebi zaten onaylandı.");
      if (current.status === "rejected") throw new Error("Reddedilmiş talebe dekont eklenemez.");
      throw new Error("Bakiye talebi şu anda güncellenemedi. Lütfen tekrar deneyin.");
    }

    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      const t = await mysqlOne<{ reference_code: string; amount_try: unknown }>(
        "SELECT reference_code, amount_try FROM wallet_topups WHERE id=?",
        [data.topupId],
      );
      const prof = await mysqlOne<{ email: string | null; display_name: string | null }>(
        "SELECT email, display_name FROM profiles WHERE id=? LIMIT 1",
        [context.userId],
      );
      const who = prof?.display_name || prof?.email || context.userId.slice(0, 8);
      if (t) {
        await notifyTelegram(
          `📎 <b>Bakiye ödeme bildirimi</b>\n` +
            `👤 ${who}\n` +
            `💰 ₺${Number(t.amount_try).toLocaleString("tr-TR")}\n` +
            `🔖 <code>${t.reference_code}</code>\n` +
            `⏳ inceleme bekliyor → /admin/cuzdan`,
        );
      }
    } catch (e) {
      console.error("[notify] markTopupPaid", (e as Error).message);
    }
    return { ok: true };
  });

const orderIdInput = z.object({ orderId: z.string() });

type WalletPaymentResult = {
  ok: boolean;
  error: string | null;
  licenseKey: string | null;
  activationToken: string | null;
  balanceAfter: number;
  pending?: boolean;
};

async function payUniquelisansOrderWithWallet(input: {
  orderId: string;
  userId: string;
  price: number;
  balanceAfter: number;
  referenceCode: string | null;
  product: {
    id: string;
    name: string | null;
    external_id: string;
    required_fields: unknown;
  };
  checkoutFields: unknown;
}): Promise<WalletPaymentResult> {
  const { mysqlExec, mysqlOne, mysqlQuery } = await import("./mysql.server");
  const { ulBuy, ulCheckAvailability } = await import("@/lib/uniquelisans.server");
  const {
    parseUniquelisansFields,
    missingUniquelisansFields,
    recordUniquelisansDelivery,
  } = await import("@/lib/uniquelisans-fulfillment.server");

  const fail = (error: string): WalletPaymentResult => ({
    ok: false,
    error,
    licenseKey: null,
    activationToken: null,
    balanceAfter: input.balanceAfter,
    pending: false,
  });

  const items = await mysqlQuery<{ product_id: string; quantity: number }>(
    "SELECT product_id,quantity FROM order_items WHERE order_id=?",
    [input.orderId],
  );
  if (items.length > 0 && (items.length !== 1 || items[0].product_id !== input.product.id || Number(items[0].quantity) !== 1)) {
    return fail("UniQLisans otomatik teslim şu an tek ürün/adet için kullanılabiliyor. Bu sepeti admin onayından geçirelim.");
  }

  const supplied = parseUniquelisansFields(input.checkoutFields);
  const missing = missingUniquelisansFields(input.product.required_fields, supplied);
  if (missing.length > 0) {
    return fail(`Otomatik teslim için eksik bilgiler var: ${missing.join(", ")}.`);
  }

  const availability = await ulCheckAvailability(Number(input.product.external_id), 1, { strict: true });
  if (!availability.ok) {
    if (availability.reason === "insufficient_stock") {
      return fail(`"${input.product.name ?? "Ürün"}" için tedarikçide yeterli stok yok (${availability.stock_count ?? 0} adet mevcut).`);
    }
    if (availability.reason === "out_of_stock") {
      return fail(`"${input.product.name ?? "Ürün"}" şu an tedarikçide stokta yok.`);
    }
    return fail("Tedarikçi şu an yanıt vermiyor; bakiyenizden ücret alınmadı.");
  }

  // Aynı siparişin çift tıklama/yenileme ile iki kez tedarikçiye gitmesini engelle.
  const claimed = await mysqlExec(
    `UPDATE orders
        SET status='reviewing', paid_with='wallet', external_status='payment_processing',
            admin_note='UniQLisans otomatik siparişi hazırlanıyor.', updated_at=?
      WHERE id=? AND user_id=? AND status='pending'`,
    [new Date().toISOString().slice(0, 19).replace("T", " "), input.orderId, input.userId],
  );
  if (claimed !== 1) return fail("Sipariş zaten işleniyor veya tamamlandı.");

  const debit = await mysqlExec(
    "UPDATE wallets SET balance_try=balance_try-?, updated_at=? WHERE user_id=? AND balance_try>=?",
    [input.price, new Date().toISOString().slice(0, 19).replace("T", " "), input.userId, input.price],
  );
  if (debit !== 1) {
    await mysqlExec(
      "UPDATE orders SET status='pending', paid_with=NULL, external_status=NULL, admin_note=NULL, updated_at=? WHERE id=? AND status='reviewing'",
      [new Date().toISOString().slice(0, 19).replace("T", " "), input.orderId],
    );
    return fail("Bakiyeniz yetersiz. Lütfen önce bakiye yükleyin.");
  }

  const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
  const afterDebit = await mysqlOne<{ balance_try: unknown }>(
    "SELECT balance_try FROM wallets WHERE user_id=? LIMIT 1",
    [input.userId],
  );
  const actualBalanceAfter = Number(afterDebit?.balance_try ?? input.balanceAfter);
  await mysqlQuery(
    `INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [crypto.randomUUID(), input.userId, "purchase", -input.price, actualBalanceAfter, input.orderId, input.product.name ?? "UniQLisans ürünü", now()],
  );

  let response;
  try {
    response = await ulBuy(Number(input.product.external_id), supplied);
  } catch (error) {
    // Ağ hatasında istek tedarikçiye ulaşmış olabilir; otomatik iade yapmak
    // yerine siparişi incelemeye bırakıyoruz, böylece çift teslim/zarar oluşmaz.
    const message = `UniQLisans API ağ hatası: ${(error as Error).message}`;
    await mysqlExec(
      "UPDATE orders SET external_status='unknown', admin_note=?, updated_at=? WHERE id=?",
      [message, now(), input.orderId],
    );
    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      await notifyTelegram(`⚠️ UniQLisans ödeme sonrası belirsiz durum — Ref: ${input.referenceCode ?? "-"} · Admin kontrolü gerekli.`);
    } catch { /* bildirim opsiyonel */ }
    return fail("Tedarikçi yanıtı alınamadı. Siparişiniz incelemeye alındı; aynı siparişi tekrar ödemeyin.");
  }

  const explicitFailure =
    response.status === "error" ||
    response.code === 402 ||
    response.code === 422 ||
    Boolean(response.status && response.status !== "success" && response.status !== "pending");
  if (explicitFailure) {
    const message = response.message || "Tedarikçi siparişi kabul etmedi.";
    const refundedAt = now();
    await mysqlExec(
      "UPDATE wallets SET balance_try=balance_try+?, updated_at=? WHERE user_id=?",
      [input.price, refundedAt, input.userId],
    );
    const walletAfterRefund = await mysqlOne<{ balance_try: unknown }>(
      "SELECT balance_try FROM wallets WHERE user_id=? LIMIT 1",
      [input.userId],
    );
    await mysqlQuery(
      `INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), input.userId, "refund", input.price, Number(walletAfterRefund?.balance_try ?? 0), input.orderId, `UniQLisans sipariş hatası: ${message}`, refundedAt],
    );
    await mysqlExec(
      "UPDATE orders SET status='reviewing', external_status='error', admin_note=?, updated_at=? WHERE id=?",
      [`UniQLisans: ${message} · Tutar otomatik iade edildi.`, refundedAt, input.orderId],
    );
    return fail(`Tedarikçi siparişi kabul etmedi; ücretiniz iade edildi. (${message})`);
  }

  if (response.status === "pending") {
    await mysqlExec(
      `UPDATE orders SET external_order_id=?, external_status='pending',
              admin_note='UniQLisans siparişi tedarikçide hazırlanıyor.', updated_at=? WHERE id=?`,
      [response.order_id == null ? null : String(response.order_id), now(), input.orderId],
    );
    try {
      const { pushNotification } = await import("./orders.functions");
      await pushNotification(
        input.userId,
        "order_pending",
        "Siparişin hazırlanıyor 📦",
        `Ref: ${input.referenceCode ?? ""} · Tedarikçi teslimatı tamamlayınca hesabına otomatik eklenecek.`,
        "/hesabim",
      );
    } catch { /* bildirim opsiyonel */ }
    return { ok: true, error: null, licenseKey: null, activationToken: null, balanceAfter: actualBalanceAfter, pending: true };
  }

  const deliveryData = String(response.delivery_data ?? "").trim();
  if (!deliveryData) {
    await mysqlExec(
      "UPDATE orders SET external_order_id=?, external_status='success', admin_note='Tedarikçi success döndü ancak teslim verisi boş; admin kontrolü gerekli.', updated_at=? WHERE id=?",
      [response.order_id == null ? null : String(response.order_id), now(), input.orderId],
    );
    return fail("Tedarikçi siparişi aldı ancak teslim bilgisi boş döndü; sipariş incelemeye alındı.");
  }

  await mysqlExec(
    "UPDATE orders SET external_order_id=?, external_status='success', external_delivery_data=?, admin_note=NULL, updated_at=? WHERE id=?",
    [response.order_id == null ? null : String(response.order_id), deliveryData, now(), input.orderId],
  );
  try {
    const delivered = await recordUniquelisansDelivery({
      orderId: input.orderId,
      productId: input.product.id,
      deliveryData,
      externalOrderId: response.order_id,
      externalStatus: "success",
    });
    try {
      const { pushNotification } = await import("./orders.functions");
      await pushNotification(
        input.userId,
        "order_paid",
        "Ödeme başarılı ✓",
        `Ref: ${input.referenceCode ?? ""} · Ürünün hesabında hazır.`,
        "/hesabim",
      );
    } catch { /* bildirim opsiyonel */ }
    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      await notifyTelegram(`✅ <b>UniQLisans otomatik teslim</b>\n📦 ${input.product.name ?? "-"}\n🔖 <code>${input.referenceCode ?? ""}</code>`);
    } catch { /* bildirim opsiyonel */ }
    return { ok: true, error: null, licenseKey: delivered.licenseKey, activationToken: delivered.activationToken, balanceAfter: actualBalanceAfter, pending: false };
  } catch (error) {
    await mysqlExec(
      "UPDATE orders SET status='reviewing', admin_note=?, updated_at=? WHERE id=?",
      [`Tedarikçi teslim etti fakat yerel teslim kaydı tamamlanamadı: ${(error as Error).message}`, now(), input.orderId],
    );
    return fail("Tedarikçi teslim etti; lisans hesabınıza ekleniyor. Aynı siparişi tekrar ödemeyin.");
  }
}

export const payOrderWithWallet = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => orderIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { mysqlQuery, mysqlOne, mysqlExec, num, bool } = await import("./mysql.server");
    const userId = context.userId;
    const fail = (error: string) => ({
      ok: false as const,
      error,
      licenseKey: null,
      activationToken: null,
      balanceAfter: 0,
      pending: false,
    });

    const order = await mysqlOne<{
      id: string;
      user_id: string;
      product_id: string | null;
      price_try: unknown;
      status: string;
      reference_code: string | null;
      checkout_fields: unknown;
    }>(
      "SELECT id, user_id, product_id, price_try, status, reference_code, checkout_fields FROM orders WHERE id=? LIMIT 1",
      [data.orderId],
    );
    if (!order || order.user_id !== userId) return fail("Sipariş bulunamadı.");
    if (order.status === "approved") return fail("Bu sipariş zaten ödendi.");
    if (order.status === "cancelled") return fail("Bu sipariş iptal edilmiş.");

    const price = num(order.price_try) ?? 0;

    const product = order.product_id
      ? await mysqlOne<{
          id: string;
          name: string | null;
          manual_fulfillment: unknown;
          unlimited_stock: unknown;
          default_license_days: number | null;
          source: string | null;
          external_id: string | null;
          required_fields: unknown;
        }>(
          "SELECT id,name,manual_fulfillment,unlimited_stock,default_license_days,source,external_id,required_fields FROM products WHERE id=? LIMIT 1",
          [order.product_id],
        )
      : null;

    const isUlProduct = product?.source === "uniquelisans" && !!product.external_id;
    if (isUlProduct && product) {
      const externalId = product.external_id;
      if (!externalId) return fail("Ürün tedarikçi eşleşmesi bulunamadı.");
      const wallet = await mysqlOne<{ balance_try: unknown }>(
        "SELECT balance_try FROM wallets WHERE user_id=? LIMIT 1",
        [userId],
      );
      const balance = num(wallet?.balance_try) ?? 0;
      if (balance < price) return fail("Bakiyeniz yetersiz. Lütfen önce bakiye yükleyin.");

      const debitPreview = Math.max(0, balance - price);
      return payUniquelisansOrderWithWallet({
        orderId: data.orderId,
        userId,
        price,
        balanceAfter: debitPreview,
        referenceCode: order.reference_code,
        product: {
          id: product.id,
          name: product.name,
          external_id: externalId,
          required_fields: product.required_fields,
        },
        checkoutFields: order.checkout_fields,
      });
    }

    const needsStock = !!product && !bool(product.manual_fulfillment) && !bool(product.unlimited_stock);
    let key: { id: string; key_value: string; activation_token: string | null } | null = null;
    if (needsStock && order.product_id) {
      key = await mysqlOne<{ id: string; key_value: string; activation_token: string | null }>(
        "SELECT id, key_value, activation_token FROM license_keys WHERE product_id=? AND status='available' AND (revoked IS NULL OR revoked=0) ORDER BY created_at LIMIT 1",
        [order.product_id],
      );
      if (!key) {
        return fail(
          `"${product?.name ?? "Ürün"}" için şu an stok bulunmuyor. Havale ile sipariş bırakabilir veya destek ile iletişime geçebilirsiniz.`,
        );
      }
    }

    const wallet = await mysqlOne<{ balance_try: unknown }>(
      "SELECT balance_try FROM wallets WHERE user_id=? LIMIT 1",
      [userId],
    );
    const balance = num(wallet?.balance_try) ?? 0;
    if (balance < price) return fail("Bakiyeniz yetersiz. Lütfen önce bakiye yükleyin.");

    // Bakiyeyi koşullu düş: aynı anda iki ödeme olursa ikincisi 0 satır günceller.
    const debit = await mysqlExec(
      "UPDATE wallets SET balance_try = balance_try - ?, updated_at=? WHERE user_id=? AND balance_try >= ?",
      [price, ts(), userId, price],
    );
    if (debit !== 1) return fail("Ödeme işlenemedi, lütfen tekrar deneyin.");
    const after = await mysqlOne<{ balance_try: unknown }>(
      "SELECT balance_try FROM wallets WHERE user_id=? LIMIT 1",
      [userId],
    );
    const balanceAfter = num(after?.balance_try) ?? 0;
    // Anahtarı koşullu ata (başkası kapmışsa 0 satır).
    let assignedKey: string | null = null;
    let activationToken: string | null = null;
    if (key) {
      const token = key.activation_token ?? crypto.randomUUID().replace(/-/g, "");
      const days = num(product?.default_license_days);
      await mysqlQuery(
        `UPDATE license_keys
            SET status='assigned', assigned_order_id=?, assigned_at=?, activation_token=?,
                expires_at = ${days ? "DATE_ADD(NOW(), INTERVAL ? DAY)" : "expires_at"}
          WHERE id=? AND status='available'`,
        days ? [data.orderId, ts(), token, days, key.id] : [data.orderId, ts(), token, key.id],
      );
      const check = await mysqlOne<{ assigned_order_id: string | null }>(
        "SELECT assigned_order_id FROM license_keys WHERE id=?",
        [key.id],
      );
      if (check?.assigned_order_id !== data.orderId) {
        // Anahtar kapılmış: bakiyeyi iade et.
        await mysqlQuery("UPDATE wallets SET balance_try = balance_try + ?, updated_at=? WHERE user_id=?", [
          price,
          ts(),
          userId,
        ]);
        return fail("Stok az önce tükendi. Bakiyeniz düşülmedi; lütfen biraz sonra tekrar deneyin.");
      }
      assignedKey = key.key_value;
      activationToken = token;
    }

    const approved = await mysqlExec(
      "UPDATE orders SET status='approved', paid_with='wallet', approved_at=?, updated_at=? WHERE id=? AND user_id=? AND status='pending'",
      [ts(), ts(), data.orderId, userId],
    );
    if (approved !== 1) {
      await mysqlExec("UPDATE wallets SET balance_try = balance_try + ?, updated_at=? WHERE user_id=?", [
        price,
        ts(),
        userId,
      ]);
      return fail("Sipariş zaten işleniyor veya tamamlandı.");
    }
    await mysqlQuery(
      `INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        userId,
        "purchase",
        -price,
        balanceAfter,
        data.orderId,
        product?.name ?? null,
        ts(),
      ],
    );
    await mysqlQuery(
      `INSERT INTO notifications (id,user_id,type,title,body,link,created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        userId,
        "order_paid",
        "Ödeme başarılı ✓",
        `Ref: ${order.reference_code ?? ""} · Anahtarların hazır.`,
        "/hesabim",
        ts(),
      ],
    ).catch(() => undefined);

    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      await notifyTelegram(
        `✅ <b>Cüzdandan ödeme başarılı</b>\n` +
          `📦 ${product?.name ?? "—"}\n` +
          `💰 ₺${price.toLocaleString("tr-TR")}\n` +
          `🔖 <code>${order.reference_code ?? ""}</code>`,
      );
    } catch (e) {
      console.error("[tg] payWallet", (e as Error).message);
    }

    return {
      ok: true as const,
      error: null,
      licenseKey: assignedKey,
      activationToken,
      balanceAfter,
      pending: false,
    };
  });

const topupIdInput = z.object({ topupId: z.string() });

export const approveTopup = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => topupIdInput.parse(d))
  .handler(async ({ data }) => {
    const { mysqlQuery, mysqlOne, mysqlExec, num } = await import("./mysql.server");
    const t = await mysqlOne<{
      id: string;
      user_id: string;
      amount_try: unknown;
      status: string;
      reference_code: string | null;
    }>("SELECT id,user_id,amount_try,status,reference_code FROM wallet_topups WHERE id=? LIMIT 1", [
      data.topupId,
    ]);
    if (!t) throw new Error("Talep bulunamadı.");
    if (t.status === "approved") throw new Error("Bu talep zaten onaylandı.");
    if (t.status === "rejected") throw new Error("Reddedilmiş talep onaylanamaz.");

    // Önce talebi atomik olarak kilitle: aynı talep iki kez bakiye ekleyemez.
    const locked = await mysqlExec(
      "UPDATE wallet_topups SET status='approved', approved_at=?, updated_at=? WHERE id=? AND status IN ('pending','reviewing')",
      [ts(), ts(), data.topupId],
    );
    if (locked === 0) throw new Error("Bu talep zaten işlendi.");
    const already = await mysqlOne<{ c: unknown }>(
      "SELECT COUNT(*) AS c FROM wallet_transactions WHERE topup_id=?",
      [t.id],
    );
    if ((num(already?.c) ?? 0) > 0) throw new Error("Bu talep için bakiye zaten eklenmiş.");

    const amount = num(t.amount_try) ?? 0;
    await mysqlQuery(
      `INSERT INTO wallets (user_id,balance_try,updated_at) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE balance_try = balance_try + VALUES(balance_try), updated_at = VALUES(updated_at)`,
      [t.user_id, amount, ts()],
    );
    const w = await mysqlOne<{ balance_try: unknown }>(
      "SELECT balance_try FROM wallets WHERE user_id=?",
      [t.user_id],
    );
    const balance = num(w?.balance_try) ?? 0;
    await mysqlQuery(
      `INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,topup_id,created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), t.user_id, "topup", amount, balance, t.id, ts()],
    );
    await mysqlQuery(
      `INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        t.user_id,
        "wallet_topup",
        "Bakiye yüklendi ✓",
        `₺${amount.toLocaleString("tr-TR")} hesabına eklendi.`,
        "/cuzdan",
        ts(),
      ],
    ).catch(() => undefined);

    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      const prof = await mysqlOne<{ email: string | null; display_name: string | null }>(
        "SELECT email, display_name FROM profiles WHERE id=? LIMIT 1",
        [t.user_id],
      );
      const who = prof?.display_name || prof?.email || t.user_id.slice(0, 8);
      await notifyTelegram(
        `✅ <b>Bakiye yükleme onaylandı</b>\n👤 ${who}\n💰 ₺${amount.toLocaleString("tr-TR")}\n🔖 <code>${t.reference_code ?? ""}</code>`,
      );
    } catch (e) {
      console.error("[tg] approveTopup", (e as Error).message);
    }
    return { ok: true, balance };
  });

const rejectTopupInput = z.object({
  topupId: z.string(),
  note: z.string().max(500).optional(),
});

export const rejectTopup = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => rejectTopupInput.parse(d))
  .handler(async ({ data }) => {
    const { mysqlQuery, mysqlOne } = await import("./mysql.server");
    const t = await mysqlOne<{
      user_id: string;
      amount_try: unknown;
      reference_code: string | null;
    }>("SELECT user_id, amount_try, reference_code FROM wallet_topups WHERE id=? LIMIT 1", [data.topupId]);
    if (!t) throw new Error("Talep bulunamadı.");

    await mysqlQuery(
      "UPDATE wallet_topups SET status='rejected', admin_note=?, updated_at=? WHERE id=?",
      [data.note ?? "", ts(), data.topupId],
    );
    await mysqlQuery(
      `INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        t.user_id,
        "wallet_topup",
        "Bakiye yükleme reddedildi",
        data.note || "Talebin reddedildi. Destek ile iletişime geçebilirsin.",
        "/cuzdan",
        ts(),
      ],
    ).catch(() => undefined);

    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      const prof = await mysqlOne<{ email: string | null; display_name: string | null }>(
        "SELECT email, display_name FROM profiles WHERE id=? LIMIT 1",
        [t.user_id],
      );
      const who = prof?.display_name || prof?.email || t.user_id.slice(0, 8);
      await notifyTelegram(
        `❌ <b>Bakiye yükleme reddedildi</b>\n👤 ${who}\n💰 ₺${Number(t.amount_try).toLocaleString("tr-TR")}\n🔖 <code>${t.reference_code ?? ""}</code>${data.note ? `\n📝 ${data.note}` : ""}`,
      );
    } catch (e) {
      console.error("[tg] rejectTopup", (e as Error).message);
    }
    return { ok: true };
  });

const adjustInput = z.object({
  userId: z.string(),
  delta: z.number().refine((v) => v !== 0 && Math.abs(v) <= 1000000, "Geçersiz tutar"),
  note: z.string().max(500).optional(),
});

export const adminAdjustWallet = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => adjustInput.parse(d))
  .handler(async ({ data, context }) => {
    const { mysqlQuery, mysqlOne, mysqlExec, num } = await import("./mysql.server");
    if (data.delta < 0) {
      const amt = Math.abs(data.delta);
      const cur = await mysqlOne<{ balance_try: unknown }>(
        "SELECT balance_try FROM wallets WHERE user_id=?",
        [data.userId],
      );
      const curBal = num(cur?.balance_try) ?? 0;
      if (curBal < amt) {
        throw new Error(`Yetersiz bakiye: kullanıcının bakiyesi ${curBal.toFixed(2)} TL, ${amt.toFixed(2)} TL düşülemez.`);
      }
      const n = await mysqlExec(
        "UPDATE wallets SET balance_try = balance_try - ?, updated_at=? WHERE user_id=? AND balance_try >= ?",
        [amt, ts(), data.userId, amt],
      );
      if (n === 0) throw new Error("Yetersiz bakiye, işlem yapılmadı.");
    } else {
      await mysqlQuery(
        `INSERT INTO wallets (user_id,balance_try,updated_at) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE balance_try = balance_try + VALUES(balance_try), updated_at = VALUES(updated_at)`,
        [data.userId, data.delta, ts()],
      );
    }
    const w = await mysqlOne<{ balance_try: unknown }>(
      "SELECT balance_try FROM wallets WHERE user_id=?",
      [data.userId],
    );
    const balance = num(w?.balance_try) ?? 0;
    try {
      await mysqlQuery(
        `INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,note,created_by,created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          data.userId,
          data.delta > 0 ? "admin_credit" : "admin_debit",
          data.delta,
          balance,
          data.note || "Admin düzeltmesi",
          context.userId,
          ts(),
        ],
      );
    } catch (e) {
      // Kayıt yazılamadı: bakiyeyi geri al ki yarım işlem kalmasın
      await mysqlExec(
        "UPDATE wallets SET balance_try = balance_try - ?, updated_at=? WHERE user_id=?",
        [data.delta, ts(), data.userId],
      );
      throw new Error("İşlem kaydedilemedi, bakiye değiştirilmedi: " + (e as Error).message);
    }
    return { ok: true, balance };
  });
