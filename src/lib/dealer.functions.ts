import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num, bool } from "./mysql.server";

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}
function uid() {
  return crypto.randomUUID();
}

export type DealerTierRow = {
  slug: string;
  name: string;
  min_volume_try: number;
  commission_percent: number;
  discount_percent: number;
  sort_order: number;
};

export const listDealerTiers = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await mysqlQuery<{
    slug: string;
    name: string;
    min_volume_try: unknown;
    commission_percent: unknown;
    discount_percent: unknown;
    sort_order: number;
  }>(
    "SELECT slug, name, min_volume_try, commission_percent, discount_percent, sort_order FROM dealer_tiers ORDER BY sort_order",
  );
  const out: DealerTierRow[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    min_volume_try: num(r.min_volume_try) ?? 0,
    commission_percent: num(r.commission_percent) ?? 0,
    discount_percent: num(r.discount_percent) ?? 0,
    sort_order: r.sort_order,
  }));
  return out;
});

export type MyDealerInfo = {
  dealer: { code: string; tier_slug: string; active: boolean } | null;
  application: { id: string; status: string; admin_note: string | null; created_at: string } | null;
};

export const getMyDealerInfo = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<MyDealerInfo> => {
    const [dealer, app] = await Promise.all([
      mysqlOne<{ code: string; tier_slug: string; active: number }>(
        "SELECT code, tier_slug, active FROM dealers WHERE user_id=? LIMIT 1",
        [context.userId],
      ),
      mysqlOne<{ id: string; status: string; admin_note: string | null; created_at: string }>(
        "SELECT id, status, admin_note, created_at FROM dealer_applications WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
        [context.userId],
      ),
    ]);
    return {
      dealer: dealer ? { code: dealer.code, tier_slug: dealer.tier_slug, active: !!dealer.active } : null,
      application: app
        ? { id: app.id, status: app.status, admin_note: app.admin_note, created_at: app.created_at }
        : null,
    };
  });

export const isDealer = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const row = await mysqlOne<{ code: string; active: number }>(
      "SELECT code, active FROM dealers WHERE user_id=? LIMIT 1",
      [context.userId],
    );
    return { active: !!row?.active, code: row?.code ?? null };
  });

export const applyForDealership = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyName: z.string().trim().min(1).max(120),
        contactPhone: z.string().max(40).optional(),
        channel: z.string().max(60).optional(),
        monthlyVolume: z.number().nonnegative().optional(),
        note: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const existingDealer = await mysqlOne<{ user_id: string }>("SELECT user_id FROM dealers WHERE user_id=?", [
      userId,
    ]);
    if (existingDealer) throw new Error("Zaten bayisiniz");
    const pending = await mysqlOne<{ id: string }>(
      "SELECT id FROM dealer_applications WHERE user_id=? AND status='pending' LIMIT 1",
      [userId],
    );
    if (pending) throw new Error("Bekleyen bir başvurunuz var");

    const wallet = await mysqlOne<{ balance_try: unknown }>("SELECT balance_try FROM wallets WHERE user_id=?", [
      userId,
    ]);
    const balance = num(wallet?.balance_try) ?? 0;
    const minBalance = 1000;
    if (balance < minBalance) {
      throw new Error(
        `Bayilik için cüzdanınızda en az ₺${minBalance} bakiye olmalı. Mevcut bakiye: ₺${balance}. Bu tutar sizden alınmaz, cüzdanınızda kalır.`,
      );
    }

    const id = crypto.randomUUID();
    await mysqlQuery(
      `INSERT INTO dealer_applications (id,user_id,company_name,contact_phone,channel,monthly_volume_try,note,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,'pending',?,?)`,
      [
        id,
        userId,
        data.companyName.slice(0, 120),
        (data.contactPhone ?? "").slice(0, 40),
        (data.channel ?? "").slice(0, 60),
        Math.max(0, data.monthlyVolume ?? 0),
        (data.note ?? "").slice(0, 1000),
        ts(),
        ts(),
      ],
    );
    return { id };
  });

export const attachDealerCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(1).max(48) }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const dealer = await mysqlOne<{ user_id: string }>(
      "SELECT user_id FROM dealers WHERE UPPER(code)=? AND active=1",
      [data.code.trim().toUpperCase()],
    );
    if (!dealer || dealer.user_id === userId) return { ok: false };
    const profile = await mysqlOne<{ dealer_id: string | null }>("SELECT dealer_id FROM profiles WHERE id=?", [
      userId,
    ]);
    if (profile?.dealer_id) return { ok: false };
    const orderRow = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM orders WHERE user_id=? AND status='approved'",
      [userId],
    );
    if (Number(orderRow?.c ?? 0) > 0) return { ok: false };
    await mysqlQuery("UPDATE profiles SET dealer_id=?, updated_at=? WHERE id=?", [dealer.user_id, ts(), userId]);
    return { ok: true };
  });

// ===================== ADMIN: DEALER APPLICATIONS =====================

export type AdminDealerApplicationRow = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  company_name: string;
  contact_phone: string | null;
  channel: string | null;
  monthly_volume_try: number;
  note: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

export const adminListDealerApplications = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminDealerApplicationRow[]> => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const rows = await mysqlQuery<{
      id: string;
      user_id: string;
      email: string | null;
      display_name: string | null;
      company_name: string;
      contact_phone: string | null;
      channel: string | null;
      monthly_volume_try: unknown;
      note: string | null;
      status: string;
      admin_note: string | null;
      created_at: string;
    }>(
      `SELECT a.id, a.user_id, p.email, p.display_name, a.company_name, a.contact_phone, a.channel,
              a.monthly_volume_try, a.note, a.status, a.admin_note, a.created_at
         FROM dealer_applications a
         LEFT JOIN profiles p ON p.id = a.user_id
        ORDER BY (a.status = 'pending') DESC, a.created_at DESC`,
    );
    return rows.map((r) => ({
      ...r,
      monthly_volume_try: num(r.monthly_volume_try) ?? 0,
    }));
  });

function genDealerCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "BAYI";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export const adminReviewDealerApplication = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        applicationId: z.string().min(1),
        approve: z.boolean(),
        adminNote: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const app = await mysqlOne<{
      id: string;
      user_id: string;
      company_name: string;
      status: string;
    }>("SELECT id, user_id, company_name, status FROM dealer_applications WHERE id=? LIMIT 1", [
      data.applicationId,
    ]);
    if (!app) throw new Error("Başvuru bulunamadı");
    if (app.status !== "pending") throw new Error("Başvuru zaten sonuçlanmış");

    if (data.approve) {
      const wallet = await mysqlOne<{ balance_try: unknown }>("SELECT balance_try FROM wallets WHERE user_id=?", [
        app.user_id,
      ]);
      const balance = num(wallet?.balance_try) ?? 0;
      if (balance < 1000) {
        throw new Error(`Kullanıcının cüzdan bakiyesi ₺1000 altında (₺${balance}). Onaylanamaz.`);
      }
    }

    const adminNote = data.adminNote?.trim() || null;
    if (data.approve) {
      const tier = await mysqlOne<{ slug: string }>(
        "SELECT slug FROM dealer_tiers ORDER BY sort_order ASC, slug ASC LIMIT 1",
      );
      if (!tier) throw new Error("Bayilik seviyeleri tanımlı değil. Önce bayi seviyelerini oluşturun.");
      let code = genDealerCode();
      for (let i = 0; i < 20; i++) {
        const existing = await mysqlOne<{ user_id: string }>("SELECT user_id FROM dealers WHERE code=?", [code]);
        if (!existing) break;
        code = genDealerCode();
      }
      const existingDealer = await mysqlOne<{ user_id: string }>("SELECT user_id FROM dealers WHERE user_id=?", [
        app.user_id,
      ]);
      if (existingDealer) {
        await mysqlQuery("UPDATE dealers SET active=1, approved_at=?, approved_by=? WHERE user_id=?", [
          ts(),
          context.userId,
          app.user_id,
        ]);
      } else {
        await mysqlQuery(
          `INSERT INTO dealers (user_id, code, company_name, tier_slug, active, approved_by, approved_at, created_at, updated_at)
           VALUES (?,?,?,?,1,?,?,?,?)`,
          [app.user_id, code, app.company_name, tier.slug, context.userId, ts(), ts(), ts()],
        );
      }
    }

    // Bayi satırı başarılı biçimde oluşturulmadan başvuruyu onaylı göstermeyiz.
    // Böylece yabancı anahtar/altyapı hatası kullanıcıyı "onaylı ama panelsiz"
    // durumda bırakmaz.
    await mysqlQuery(
      "UPDATE dealer_applications SET status=?, admin_note=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?",
      [data.approve ? "approved" : "rejected", adminNote, context.userId, ts(), ts(), data.applicationId],
    );

    await mysqlQuery(
      "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)",
      [
        crypto.randomUUID(),
        app.user_id,
        "dealer",
        data.approve ? "Bayilik başvurun onaylandı" : "Bayilik başvurun reddedildi",
        adminNote ?? (data.approve ? "Bayi panelin aktif, hemen incele." : "Daha sonra tekrar başvurabilirsin."),
        data.approve ? "/bayi" : "/bayilik",
        ts(),
      ],
    );

    return { ok: true };
  });

// ===================== ADMIN: DEALERS =====================

export type AdminDealerRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  code: string;
  company_name: string | null;
  tier_slug: string;
  commission_percent: number;
  discount_percent: number;
  total_volume_try: number;
  total_commission_try: number;
  paid_commission_try: number;
  pending_commission_try: number;
  customer_count: number;
  active: boolean;
  created_at: string;
};

export const adminListDealers = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminDealerRow[]> => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const rows = await mysqlQuery<{
      user_id: string;
      email: string | null;
      display_name: string | null;
      code: string;
      company_name: string | null;
      tier_slug: string;
      commission_percent: unknown;
      discount_percent: unknown;
      total_volume_try: unknown;
      total_commission_try: unknown;
      paid_commission_try: unknown;
      pending_commission_try: unknown;
      customer_count: unknown;
      active: number;
      created_at: string;
    }>(
      `SELECT d.user_id, p.email, p.display_name, d.code, d.company_name, d.tier_slug,
              COALESCE(d.commission_percent, t.commission_percent) AS commission_percent,
              COALESCE(d.discount_percent, t.discount_percent) AS discount_percent,
              d.total_volume_try, d.total_commission_try, d.paid_commission_try,
              (SELECT COALESCE(SUM(c.amount_try),0) FROM dealer_commissions c
                WHERE c.dealer_user_id = d.user_id AND c.status = 'pending') AS pending_commission_try,
              (SELECT COUNT(*) FROM profiles pr WHERE pr.dealer_id = d.user_id) AS customer_count,
              d.active, d.created_at
         FROM dealers d
         JOIN dealer_tiers t ON t.slug = d.tier_slug
         LEFT JOIN profiles p ON p.id = d.user_id
        ORDER BY d.total_volume_try DESC`,
    );
    return rows.map((r) => ({
      user_id: r.user_id,
      email: r.email,
      display_name: r.display_name,
      code: r.code,
      company_name: r.company_name,
      tier_slug: r.tier_slug,
      commission_percent: num(r.commission_percent) ?? 0,
      discount_percent: num(r.discount_percent) ?? 0,
      total_volume_try: num(r.total_volume_try) ?? 0,
      total_commission_try: num(r.total_commission_try) ?? 0,
      paid_commission_try: num(r.paid_commission_try) ?? 0,
      pending_commission_try: num(r.pending_commission_try) ?? 0,
      customer_count: Number(r.customer_count ?? 0),
      active: !!r.active,
      created_at: r.created_at,
    }));
  });

export const adminUpdateDealer = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().min(1),
        active: z.boolean().optional(),
        tierSlug: z.string().optional(),
        commissionPercent: z.number().optional(),
        discountPercent: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const dealer = await mysqlOne<{
      active: number;
      tier_slug: string;
      commission_percent: unknown;
      discount_percent: unknown;
    }>("SELECT active, tier_slug, commission_percent, discount_percent FROM dealers WHERE user_id=?", [
      data.userId,
    ]);
    if (!dealer) throw new Error("Bayi bulunamadı");

    const active = data.active === undefined ? !!dealer.active : data.active;
    const tierSlug = data.tierSlug ?? dealer.tier_slug;

    let commissionPercent: number | null = num(dealer.commission_percent);
    if (data.commissionPercent !== undefined) {
      commissionPercent = data.commissionPercent < 0 ? null : Math.min(data.commissionPercent, 40);
    }
    let discountPercent: number | null = num(dealer.discount_percent);
    if (data.discountPercent !== undefined) {
      discountPercent = data.discountPercent < 0 ? null : Math.min(data.discountPercent, 30);
    }

    await mysqlQuery(
      "UPDATE dealers SET active=?, tier_slug=?, commission_percent=?, discount_percent=?, updated_at=? WHERE user_id=?",
      [active ? 1 : 0, tierSlug, commissionPercent, discountPercent, ts(), data.userId],
    );
    return { ok: true };
  });

// ===================== DEALER PANEL (self-service) =====================

export type DealerStatsResult = {
  code: string;
  company_name: string | null;
  active: boolean;
  tier_slug: string;
  tier_name: string;
  commission_percent: number;
  discount_percent: number;
  total_volume_try: number;
  total_commission_try: number;
  paid_commission_try: number;
  pending_commission_try: number;
  wallet_balance_try: number;
  customer_count: number;
  order_count: number;
  next_tier: {
    name: string;
    min_volume_try: number;
    commission_percent: number;
    discount_percent: number;
  } | null;
  monthly: { month: string; volume: number; commission: number; orders: number }[];
} | null;

export const getDealerStats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<DealerStatsResult> => {
    const userId = context.userId;
    const d = await mysqlOne<{
      code: string;
      company_name: string | null;
      active: number;
      tier_slug: string;
      commission_percent: unknown;
      discount_percent: unknown;
      total_volume_try: unknown;
      total_commission_try: unknown;
      paid_commission_try: unknown;
      tier_name: string;
      tier_commission_percent: unknown;
      tier_discount_percent: unknown;
    }>(
      `SELECT d.code, d.company_name, d.active, d.tier_slug, d.commission_percent, d.discount_percent,
              d.total_volume_try, d.total_commission_try, d.paid_commission_try,
              t.name AS tier_name, t.commission_percent AS tier_commission_percent, t.discount_percent AS tier_discount_percent
         FROM dealers d JOIN dealer_tiers t ON t.slug = d.tier_slug
        WHERE d.user_id=? LIMIT 1`,
      [userId],
    );
    if (!d) return null;

    const totalVolume = num(d.total_volume_try) ?? 0;
    const nextTier = await mysqlOne<{
      name: string;
      min_volume_try: unknown;
      commission_percent: unknown;
      discount_percent: unknown;
    }>(
      "SELECT name, min_volume_try, commission_percent, discount_percent FROM dealer_tiers WHERE min_volume_try > ? ORDER BY min_volume_try ASC LIMIT 1",
      [totalVolume],
    );

    const pendingRow = await mysqlOne<{ s: unknown }>(
      "SELECT SUM(amount_try) s FROM dealer_commissions WHERE dealer_user_id=? AND status='pending'",
      [userId],
    );
    const walletRow = await mysqlOne<{ balance_try: unknown }>(
      "SELECT balance_try FROM wallets WHERE user_id=? LIMIT 1",
      [userId],
    );
    const customerRow = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM profiles WHERE dealer_id=?",
      [userId],
    );
    const orderRow = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM dealer_commissions WHERE dealer_user_id=?",
      [userId],
    );
    const monthlyRows = await mysqlQuery<{
      month: string;
      volume: unknown;
      commission: unknown;
      orders: number;
    }>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, SUM(base_amount_try) AS volume,
              SUM(amount_try) AS commission, COUNT(*) AS orders
         FROM dealer_commissions
        WHERE dealer_user_id=? AND created_at > DATE_SUB(NOW(), INTERVAL 6 MONTH)
        GROUP BY month
        ORDER BY month DESC`,
      [userId],
    );

    return {
      code: d.code,
      company_name: d.company_name,
      active: !!d.active,
      tier_slug: d.tier_slug,
      tier_name: d.tier_name,
      commission_percent: num(d.commission_percent) ?? num(d.tier_commission_percent) ?? 0,
      discount_percent: num(d.discount_percent) ?? num(d.tier_discount_percent) ?? 0,
      total_volume_try: totalVolume,
      total_commission_try: num(d.total_commission_try) ?? 0,
      paid_commission_try: num(d.paid_commission_try) ?? 0,
      pending_commission_try: num(pendingRow?.s) ?? 0,
      wallet_balance_try: num(walletRow?.balance_try) ?? 0,
      customer_count: Number(customerRow?.c ?? 0),
      order_count: Number(orderRow?.c ?? 0),
      next_tier: nextTier
        ? {
            name: nextTier.name,
            min_volume_try: num(nextTier.min_volume_try) ?? 0,
            commission_percent: num(nextTier.commission_percent) ?? 0,
            discount_percent: num(nextTier.discount_percent) ?? 0,
          }
        : null,
      monthly: monthlyRows.map((m) => ({
        month: m.month,
        volume: num(m.volume) ?? 0,
        commission: num(m.commission) ?? 0,
        orders: Number(m.orders ?? 0),
      })),
    };
  });

export type DealerPriceListItem = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  image_url: string | null;
  price_try: number;
  dealer_price_try: number;
  available: number;
  unlimited_stock: boolean;
};

async function requireDealerDiscount(userId: string): Promise<number> {
  const row = await mysqlOne<{ discount_percent: unknown; tier_discount_percent: unknown }>(
    `SELECT d.discount_percent AS discount_percent, t.discount_percent AS tier_discount_percent
       FROM dealers d JOIN dealer_tiers t ON t.slug = d.tier_slug
      WHERE d.user_id=? AND d.active=1 LIMIT 1`,
    [userId],
  );
  if (!row) throw new Error("Bayi değilsiniz");
  return num(row.discount_percent) ?? num(row.tier_discount_percent) ?? 0;
}

export const getDealerPriceList = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<DealerPriceListItem[]> => {
    const disc = await requireDealerDiscount(context.userId);
    const products = await mysqlQuery<{
      id: string;
      name: string;
      slug: string;
      category: string | null;
      image_url: string | null;
      price_try: unknown;
      unlimited_stock: number | null;
    }>(
      `SELECT id, name, slug, category, image_url, price_try, unlimited_stock
         FROM products WHERE active=1 ORDER BY sort_order, name`,
    );
    const out: DealerPriceListItem[] = [];
    for (const p of products) {
      const price = num(p.price_try) ?? 0;
      const avail = await mysqlOne<{ c: number }>(
        "SELECT COUNT(*) c FROM license_keys WHERE product_id=? AND status='available'",
        [p.id],
      );
      out.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        image_url: p.image_url,
        price_try: price,
        dealer_price_try: Math.round(((price * (100 - disc)) / 100) * 100) / 100,
        available: Number(avail?.c ?? 0),
        unlimited_stock: !!p.unlimited_stock,
      });
    }
    return out;
  });

const dealerPurchaseInput = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
});

export const dealerPurchaseProduct = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => dealerPurchaseInput.parse(d))
  .handler(async ({ data, context }): Promise<{ order_id: string; total_try: number }> => {
    const userId = context.userId;
    const disc = await requireDealerDiscount(userId);

    const product = await mysqlOne<{
      id: string;
      name: string;
      price_try: unknown;
      manual_fulfillment: number | null;
      unlimited_stock: number | null;
    }>(
      "SELECT id, name, price_try, manual_fulfillment, unlimited_stock FROM products WHERE id=? AND active=1 LIMIT 1",
      [data.productId],
    );
    if (!product) throw new Error("Ürün bulunamadı");

    if (!bool(product.manual_fulfillment) && !bool(product.unlimited_stock)) {
      const avail = await mysqlOne<{ c: number }>(
        "SELECT COUNT(*) c FROM license_keys WHERE product_id=? AND status='available'",
        [data.productId],
      );
      if (Number(avail?.c ?? 0) < data.quantity) {
        throw new Error(`Stokta yeterli anahtar yok (${Number(avail?.c ?? 0)} adet)`);
      }
    }

    const price = num(product.price_try) ?? 0;
    const subtotal = Math.round(price * data.quantity * 100) / 100;
    const discount = Math.round(((subtotal * disc) / 100) * 100) / 100;
    const final = Math.max(0, subtotal - discount);

    const wallet = await mysqlOne<{ balance_try: unknown }>(
      "SELECT balance_try FROM wallets WHERE user_id=?",
      [userId],
    );
    const balance = num(wallet?.balance_try) ?? 0;
    if (balance < final) throw new Error("Yetersiz bakiye");

    const orderId = uid();
    const reference = (() => {
      const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
      let out = "SBR-";
      for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
      return out;
    })();

    await mysqlQuery(
      `INSERT INTO orders (id,user_id,product_id,price_try,reference_code,status,item_count,user_note,created_at,updated_at)
       VALUES (?,?,NULL,?,?,'pending',?,'Bayi toplu alım',?,?)`,
      [orderId, userId, subtotal, reference, data.quantity, ts(), ts()],
    );
    await mysqlQuery(
      `INSERT INTO order_items (id,order_id,product_id,quantity,unit_price_try,product_name_snapshot)
       VALUES (?,?,?,?,?,?)`,
      [uid(), orderId, product.id, data.quantity, price, product.name],
    );
    if (discount > 0) {
      await mysqlQuery(
        `INSERT INTO order_discounts (id,order_id,code_snapshot,discount_try,product_id) VALUES (?,?,?,?,?)`,
        [uid(), orderId, `BAYI-${disc}`, discount, product.id],
      );
    }

    await mysqlQuery(
      "UPDATE wallets SET balance_try=balance_try-?, updated_at=? WHERE user_id=? AND balance_try>=?",
      [final, ts(), userId, final],
    );
    const after = await mysqlOne<{ balance_try: unknown }>(
      "SELECT balance_try FROM wallets WHERE user_id=?",
      [userId],
    );
    const balanceAfter = num(after?.balance_try) ?? 0;
    await mysqlQuery(
      `INSERT INTO wallet_transactions (id,user_id,kind,amount_try,balance_after,order_id,note,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uid(), userId, "purchase", -final, balanceAfter, orderId, "Bayi toplu alım", ts()],
    );
    await mysqlQuery(
      "UPDATE orders SET status='approved', approved_at=?, paid_with='wallet', updated_at=? WHERE id=?",
      [ts(), ts(), orderId],
    );

    const { assignKeyToOrder } = await import("./license-mysql.server");
    await assignKeyToOrder(orderId).catch(() => {});

    return { order_id: orderId, total_try: final };
  });

export type DealerOrderRow = {
  id: string;
  reference_code: string;
  status: string;
  price_try: number;
  item_count: number;
  created_at: string;
  product_name: string | null;
  items: { quantity: number; product_name_snapshot: string }[];
  keys: string[];
};

export const getDealerOrders = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<DealerOrderRow[]> => {
    const userId = context.userId;
    const orders = await mysqlQuery<{
      id: string;
      reference_code: string;
      status: string;
      price_try: unknown;
      item_count: number;
      created_at: string;
      product_name: string | null;
    }>(
      `SELECT o.id, o.reference_code, o.status, o.price_try, o.item_count, o.created_at, p.name AS product_name
         FROM orders o
         LEFT JOIN products p ON p.id = o.product_id
        WHERE o.user_id=?
        ORDER BY o.created_at DESC LIMIT 200`,
      [userId],
    );
    const out: DealerOrderRow[] = [];
    for (const o of orders) {
      const items = await mysqlQuery<{ quantity: number; product_name_snapshot: string }>(
        "SELECT quantity, product_name_snapshot FROM order_items WHERE order_id=?",
        [o.id],
      );
      const keys = await mysqlQuery<{ key_value: string | null }>(
        `SELECT lk.key_value FROM order_keys ok JOIN license_keys lk ON lk.id = ok.license_key_id WHERE ok.order_id=?`,
        [o.id],
      );
      out.push({
        id: o.id,
        reference_code: o.reference_code,
        status: o.status,
        price_try: num(o.price_try) ?? 0,
        item_count: Number(o.item_count ?? 0),
        created_at: o.created_at,
        product_name: o.product_name,
        items: items.map((i) => ({
          quantity: Number(i.quantity ?? 1),
          product_name_snapshot: i.product_name_snapshot,
        })),
        keys: keys.map((k) => k.key_value).filter((k): k is string => !!k),
      });
    }
    return out;
  });

export type DealerCustomerRow = {
  user_id: string;
  display_name: string;
  email_masked: string | null;
  order_count: number;
  total_spent: number;
};

export const getDealerCustomers = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<DealerCustomerRow[]> => {
    const userId = context.userId;
    const rows = await mysqlQuery<{
      id: string;
      display_name: string | null;
      email: string | null;
      order_count: unknown;
      total_spent: unknown;
    }>(
      `SELECT p.id, p.display_name, p.email,
              (SELECT COUNT(*) FROM dealer_commissions c WHERE c.buyer_user_id=p.id AND c.dealer_user_id=?) AS order_count,
              (SELECT COALESCE(SUM(c.base_amount_try),0) FROM dealer_commissions c WHERE c.buyer_user_id=p.id AND c.dealer_user_id=?) AS total_spent
         FROM profiles p
        WHERE p.dealer_id=?
        ORDER BY p.created_at DESC LIMIT 200`,
      [userId, userId, userId],
    );
    return rows.map((r) => ({
      user_id: r.id,
      display_name: r.display_name ?? "Kullanıcı",
      email_masked: r.email ? `${r.email.slice(0, 2)}***${r.email.slice(r.email.indexOf("@"))}` : null,
      order_count: Number(r.order_count ?? 0),
      total_spent: num(r.total_spent) ?? 0,
    }));
  });

export type DealerApiKeyRow = {
  id: string;
  label: string;
  key_prefix: string;
  revoked: boolean;
  call_count: number;
  last_used_at: string | null;
  created_at: string;
};

export const listDealerApiKeys = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<DealerApiKeyRow[]> => {
    const rows = await mysqlQuery<{
      id: string;
      label: string;
      key_prefix: string;
      revoked: number;
      call_count: number;
      last_used_at: string | null;
      created_at: string;
    }>(
      "SELECT id, label, key_prefix, revoked, call_count, last_used_at, created_at FROM dealer_api_keys WHERE user_id=? ORDER BY created_at DESC",
      [context.userId],
    );
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      key_prefix: r.key_prefix,
      revoked: !!r.revoked,
      call_count: Number(r.call_count ?? 0),
      last_used_at: r.last_used_at,
      created_at: r.created_at,
    }));
  });

export const issueDealerApiKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ label: z.string().max(40).optional() }).parse(d))
  .handler(async ({ data, context }): Promise<{ id: string; api_key: string; key_prefix: string }> => {
    const userId = context.userId;
    const dealer = await mysqlOne<{ user_id: string }>(
      "SELECT user_id FROM dealers WHERE user_id=? AND active=1",
      [userId],
    );
    if (!dealer) throw new Error("Bayi değilsiniz");
    const cnt = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM dealer_api_keys WHERE user_id=? AND revoked=0",
      [userId],
    );
    if (Number(cnt?.c ?? 0) >= 5) throw new Error("En fazla 5 aktif anahtar oluşturabilirsiniz");

    const { createHash } = await import("crypto");
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const apiKey = `sbr_live_${hex}`;
    const keyHash = createHash("sha256").update(apiKey).digest("hex");
    const keyPrefix = apiKey.slice(0, 17);
    const id = uid();
    await mysqlQuery(
      "INSERT INTO dealer_api_keys (id,user_id,label,key_hash,key_prefix,revoked,call_count,created_at) VALUES (?,?,?,?,?,0,0,?)",
      [id, userId, data.label?.trim() || "API anahtarı", keyHash, keyPrefix, ts()],
    );
    return { id, api_key: apiKey, key_prefix: keyPrefix };
  });

export const revokeDealerApiKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await mysqlQuery("UPDATE dealer_api_keys SET revoked=1 WHERE id=? AND user_id=?", [
      data.id,
      context.userId,
    ]);
    return { ok: true };
  });

export type DealerWebhookRow = {
  id: string;
  url: string;
  secret: string;
  active: boolean;
  last_status: number | null;
  last_sent_at: string | null;
  fail_count: number;
  created_at: string;
};

export const listDealerWebhooks = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<DealerWebhookRow[]> => {
    const rows = await mysqlQuery<{
      id: string;
      url: string;
      secret: string;
      active: number;
      last_status: number | null;
      last_sent_at: string | null;
      fail_count: number | null;
      created_at: string;
    }>(
      "SELECT id, url, secret, active, last_status, last_sent_at, fail_count, created_at FROM dealer_webhooks WHERE user_id=? ORDER BY created_at DESC",
      [context.userId],
    );
    return rows.map((r) => ({
      id: r.id,
      url: r.url,
      secret: r.secret,
      active: !!r.active,
      last_status: r.last_status,
      last_sent_at: r.last_sent_at,
      fail_count: Number(r.fail_count ?? 0),
      created_at: r.created_at,
    }));
  });

export const addDealerWebhook = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ url: z.string().trim().url().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!/^https:\/\//i.test(data.url)) throw new Error("https:// ile başlayan bir adres gir");
    const dealer = await mysqlOne<{ user_id: string }>(
      "SELECT user_id FROM dealers WHERE user_id=? AND active=1",
      [userId],
    );
    if (!dealer) throw new Error("Bayi değilsiniz");
    const cnt = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM dealer_webhooks WHERE user_id=?",
      [userId],
    );
    if (Number(cnt?.c ?? 0) >= 3) throw new Error("En fazla 3 webhook ekleyebilirsin");

    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const secret = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const id = uid();
    await mysqlQuery(
      `INSERT INTO dealer_webhooks (id,user_id,url,secret,events,active,fail_count,created_at,updated_at)
       VALUES (?,?,?,?,?,1,0,?,?)`,
      [
        id,
        userId,
        data.url.trim(),
        secret,
        JSON.stringify(["product.created", "product.price_changed", "product.stock_changed"]),
        ts(),
        ts(),
      ],
    );
    return { id };
  });

export const removeDealerWebhook = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await mysqlQuery("DELETE FROM dealer_webhooks WHERE id=? AND user_id=?", [data.id, context.userId]);
    return { ok: true };
  });
