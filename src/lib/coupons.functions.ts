import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { mysqlQuery, mysqlOne, num, bool } from "./mysql.server";

function ts() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

type CouponRow = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: unknown;
  min_order_try: unknown;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: number;
  user_id: string | null;
};

export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().trim().min(1).max(50), subtotal: z.number().nonnegative() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const code = data.code.trim().toUpperCase();
    if (!code) throw new Error("Kod boş");
    const c = await mysqlOne<CouponRow>("SELECT * FROM coupons WHERE UPPER(code)=? LIMIT 1", [code]);
    if (!c) throw new Error("Kupon bulunamadı");
    if (!bool(c.is_active)) throw new Error("Kupon aktif değil");
    if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) throw new Error("Kuponun süresi dolmuş");
    if (c.max_uses !== null && c.used_count >= c.max_uses) throw new Error("Kupon kullanım limiti dolmuş");
    if (c.user_id && c.user_id !== context.userId) throw new Error("Bu kupon size ait değil");
    const minOrder = num(c.min_order_try) ?? 0;
    if (data.subtotal < minOrder) throw new Error(`Minimum sepet tutarı: ₺${minOrder}`);

    const usedRow = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) c FROM coupon_redemptions WHERE coupon_id=? AND user_id=?",
      [c.id, context.userId],
    );
    if (Number(usedRow?.c ?? 0) > 0) throw new Error("Bu kuponu daha önce kullandınız");

    const discountValue = num(c.discount_value) ?? 0;
    let discount =
      c.discount_type === "percent" ? Math.round(((data.subtotal * discountValue) / 100) * 100) / 100 : discountValue;
    if (discount > data.subtotal) discount = data.subtotal;

    return {
      couponId: c.id,
      code: c.code,
      discountTry: discount,
      finalTry: data.subtotal - discount,
    };
  });

/* ================= ADMIN ================= */

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(3).max(50),
  discount_type: z.enum(["percent", "amount"]),
  discount_value: z.number().positive(),
  min_order_try: z.number().nonnegative().default(0),
  max_uses: z.number().int().positive().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

export const adminUpsertCoupon = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const code = data.code.toUpperCase();
    if (data.id) {
      await mysqlQuery(
        `UPDATE coupons SET code=?, discount_type=?, discount_value=?, min_order_try=?, max_uses=?, expires_at=?, is_active=?, updated_at=?
           WHERE id=?`,
        [
          code,
          data.discount_type,
          data.discount_value,
          data.min_order_try,
          data.max_uses ?? null,
          data.expires_at || null,
          data.is_active ? 1 : 0,
          ts(),
          data.id,
        ],
      );
      return { id: data.id };
    }
    const id = crypto.randomUUID();
    await mysqlQuery(
      `INSERT INTO coupons (id,code,discount_type,discount_value,min_order_try,max_uses,expires_at,is_active,used_count,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,0,?,?)`,
      [
        id,
        code,
        data.discount_type,
        data.discount_value,
        data.min_order_try,
        data.max_uses ?? null,
        data.expires_at || null,
        data.is_active ? 1 : 0,
        ts(),
        ts(),
      ],
    );
    return { id };
  });

export const adminDeleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    await mysqlQuery("DELETE FROM coupons WHERE id=?", [data.id]);
    return { ok: true };
  });

export const adminIssueSegmentCoupons = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        segment: z.enum(["no_purchase", "returning", "inactive_30"]),
        discount_type: z.enum(["percent", "amount"]),
        discount_value: z.number().positive(),
        min_order_try: z.number().nonnegative().default(0),
        days_valid: z.number().int().min(1).max(90).default(7),
        limit: z.number().int().min(1).max(1000).default(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz");

    let where: string;
    if (data.segment === "no_purchase") {
      where = "NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id=p.id AND o.status='approved')";
    } else if (data.segment === "returning") {
      where = "EXISTS (SELECT 1 FROM orders o WHERE o.user_id=p.id AND o.status='approved')";
    } else {
      where =
        "EXISTS (SELECT 1 FROM orders o WHERE o.user_id=p.id AND o.status='approved') AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id=p.id AND o.status='approved' AND o.created_at > (NOW() - INTERVAL 30 DAY))";
    }

    const users = await mysqlQuery<{ id: string }>(
      `SELECT p.id FROM profiles p
         WHERE ${where}
           AND NOT EXISTS (
             SELECT 1 FROM coupons c WHERE c.user_id=p.id AND c.is_personal=1 AND c.is_active=1
               AND (c.expires_at IS NULL OR c.expires_at > NOW()) AND c.used_count=0
           )
         ORDER BY p.created_at DESC LIMIT ?`,
      [data.limit],
    );

    const expiresAt = new Date(Date.now() + data.days_valid * 86400000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    let sampleCode: string | null = null;
    let issued = 0;
    for (const u of users) {
      const code = `CMP${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      await mysqlQuery(
        `INSERT INTO coupons (id,code,discount_type,discount_value,min_order_try,max_uses,expires_at,is_active,used_count,user_id,is_personal,created_at,updated_at)
         VALUES (?,?,?,?,?,1,?,1,0,?,1,?,?)`,
        [
          crypto.randomUUID(),
          code,
          data.discount_type,
          data.discount_value,
          data.min_order_try,
          expiresAt,
          u.id,
          ts(),
          ts(),
        ],
      );
      const body =
        data.discount_type === "percent"
          ? `%${data.discount_value} indirim · kod: ${code}`
          : `${data.discount_value} TL indirim · kod: ${code}`;
      await mysqlQuery(
        "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)",
        [crypto.randomUUID(), u.id, "coupon", "Sana özel indirim kuponu", body, "/urunler", ts()],
      );
      issued++;
      if (!sampleCode) sampleCode = code;
    }

    return { issued, sampleCode };
  });

export type AdminCouponRow = {
  id: string;
  code: string;
  discount_type: "percent" | "amount";
  discount_value: number;
  min_order_try: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

export const adminListCoupons = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminCouponRow[]> => {
    if (!context.isAdmin) throw new Error("Yetkisiz");
    const rows = await mysqlQuery<CouponRow & { created_at: string }>(
      "SELECT * FROM coupons ORDER BY created_at DESC",
    );
    return rows.map((c) => ({
      id: c.id,
      code: c.code,
      discount_type: c.discount_type as "percent" | "amount",
      discount_value: num(c.discount_value) ?? 0,
      min_order_try: num(c.min_order_try) ?? 0,
      max_uses: c.max_uses,
      used_count: c.used_count,
      expires_at: c.expires_at,
      is_active: bool(c.is_active),
      created_at: c.created_at,
    }));
  });
