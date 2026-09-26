import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCookie } from "@tanstack/react-start/server";
import { requireAuth } from "@/lib/auth-middleware.server";
import { mysqlQuery, mysqlOne, num } from "@/lib/mysql.server";

export type MyOrderProductRef = { name: string; slug: string; delivery_type: string } | null;

export type MyOrder = {
  id: string;
  status: string;
  price_try: number;
  reference_code: string;
  created_at: string;
  product: MyOrderProductRef;
  items: {
    quantity: number;
    product_name_snapshot: string;
    warranty: boolean;
    warranty_price_try: number;
    warranty_label: string | null;
    product: { slug: string; delivery_type: string } | null;
  }[];
  keys: {
    license_key: {
      key_value: string;
      activation_token: string | null;
      expires_at: string | null;
      duration_days: number | null;
      product: MyOrderProductRef;
    } | null;
  }[];
};

/** Oturum sahibi kullanıcının siparişleri (ürün/anahtar detaylarıyla). */
export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<MyOrder[]> => {
    const userId = context.userId;
    const orders = await mysqlQuery<{
      id: string;
      status: string;
      price_try: unknown;
      reference_code: string;
      created_at: string;
      product_id: string | null;
      product_name: string | null;
      product_slug: string | null;
      product_delivery_type: string | null;
    }>(
      `SELECT o.id, o.status, o.price_try, o.reference_code, o.created_at, o.product_id,
              p.name AS product_name, p.slug AS product_slug, p.delivery_type AS product_delivery_type
         FROM orders o LEFT JOIN products p ON p.id = o.product_id
        WHERE o.user_id=? ORDER BY o.created_at DESC`,
      [userId],
    );
    if (orders.length === 0) return [];

    const ids = orders.map((o) => o.id);
    const placeholders = ids.map(() => "?").join(",");

    const items = await mysqlQuery<{
      order_id: string;
      quantity: number;
      product_name_snapshot: string;
      warranty: unknown;
      warranty_price_try: unknown;
      warranty_label: string | null;
      product_slug: string | null;
      product_delivery_type: string | null;
    }>(
      `SELECT oi.order_id, oi.quantity, oi.product_name_snapshot,
              oi.warranty, oi.warranty_price_try, oi.warranty_label,
              p.slug AS product_slug, p.delivery_type AS product_delivery_type
         FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id IN (${placeholders})`,
      ids,
    );

    const keys = await mysqlQuery<{
      order_id: string;
      key_value: string | null;
      activation_token: string | null;
      expires_at: string | null;
      duration_days: number | null;
      product_name: string | null;
      product_slug: string | null;
      product_delivery_type: string | null;
    }>(
      `SELECT ok.order_id, lk.key_value, lk.activation_token, lk.expires_at, lk.duration_days,
              p.name AS product_name, p.slug AS product_slug, p.delivery_type AS product_delivery_type
         FROM order_keys ok
         JOIN license_keys lk ON lk.id = ok.license_key_id
         LEFT JOIN products p ON p.id = lk.product_id
        WHERE ok.order_id IN (${placeholders})`,
      ids,
    );

    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      price_try: num(o.price_try) ?? 0,
      reference_code: o.reference_code,
      created_at: o.created_at,
      product: o.product_id
        ? { name: o.product_name ?? "", slug: o.product_slug ?? "", delivery_type: o.product_delivery_type ?? "key" }
        : null,
      items: items
        .filter((i) => i.order_id === o.id)
        .map((i) => ({
          quantity: i.quantity,
          product_name_snapshot: i.product_name_snapshot,
          warranty: !!(i.warranty && (i.warranty === true || i.warranty === 1 || i.warranty === "1")),
          warranty_price_try: num(i.warranty_price_try) ?? 0,
          warranty_label: i.warranty_label ?? null,
          product: i.product_slug
            ? { slug: i.product_slug, delivery_type: i.product_delivery_type ?? "key" }
            : null,
        })),
      keys: keys
        .filter((k) => k.order_id === o.id)
        .map((k) => ({
          license_key: k.key_value
            ? {
                key_value: k.key_value,
                activation_token: k.activation_token,
                expires_at: k.expires_at,
                duration_days: k.duration_days,
                product: k.product_name
                  ? { name: k.product_name, slug: k.product_slug ?? "", delivery_type: k.product_delivery_type ?? "key" }
                  : null,
              }
            : null,
        })),
    }));
  });

/** Kullanıcının seçtiği avatar id'si. */
export const getMyAvatar = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ avatar_id: string | null }> => {
    const row = await mysqlOne<{ avatar_id: string | null }>(
      "SELECT avatar_id FROM profiles WHERE id=?",
      [context.userId],
    );
    return { avatar_id: row?.avatar_id ?? null };
  });

const avatarInput = z.object({ avatarId: z.string().min(1).max(60) });

export const updateMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => avatarInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await mysqlQuery("UPDATE profiles SET avatar_id=? WHERE id=?", [data.avatarId, context.userId]);
    return { ok: true };
  });

const telegramInput = z.object({ telegramHandle: z.string().max(120) });

export const updateMyTelegramHandle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => telegramInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await mysqlQuery("UPDATE profiles SET telegram_handle=? WHERE id=?", [data.telegramHandle, context.userId]);
    return { ok: true };
  });

const passwordInput = z.object({ password: z.string().min(6).max(200) });

/** Şifre değiştirme. Kullanıcının doğrulanmış 2FA'sı varsa bu oturum aal2 olmalı. */
export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => passwordInput.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { getMfaRow } = await import("@/lib/totp.server");
    const { SESSION_COOKIE, hashPassword } = await import("@/lib/auth.server");
    const mfaRow = await getMfaRow(context.userId);
    if (mfaRow && mfaRow.verified === 1) {
      const token = getCookie(SESSION_COOKIE);
      const sess = token
        ? await mysqlOne<{ mfa_verified_at: string | null }>(
            "SELECT mfa_verified_at FROM auth_sessions WHERE token=? AND user_id=?",
            [token, context.userId],
          )
        : null;
      if (!sess?.mfa_verified_at) {
        throw new Error("Şifre değişikliği için önce 2FA doğrulaması gerekli.");
      }
    }
    const hash = await hashPassword(data.password);
    await mysqlQuery("UPDATE auth_users SET password_hash=? WHERE id=?", [hash, context.userId]);
    return { ok: true };
  });

/** Kullanıcının cüzdan bakiyesi. */
export const getMyWalletBalance = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ balance_try: number }> => {
    const row = await mysqlOne<{ balance_try: unknown }>(
      "SELECT balance_try FROM wallets WHERE user_id=?",
      [context.userId],
    );
    return { balance_try: num(row?.balance_try) ?? 0 };
  });

/** Kullanıcının Telegram eşleşme durumu. */
export const getTelegramStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ chat_id: string | null; verify_code: string | null }> => {
    const row = await mysqlOne<{ telegram_chat_id: string | null; telegram_verify_code: string | null }>(
      "SELECT telegram_chat_id, telegram_verify_code FROM profiles WHERE id=?",
      [context.userId]
    );
    return { chat_id: row?.telegram_chat_id ?? null, verify_code: row?.telegram_verify_code ?? null };
  });

/** Telegram eşleştirme kodu oluşturur. */
export const generateTelegramVerifyCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ code: string }> => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await mysqlQuery("UPDATE profiles SET telegram_verify_code=? WHERE id=?", [code, context.userId]);
    return { code };
  });
