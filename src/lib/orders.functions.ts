import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createOrderInput = z.object({ productId: z.string().uuid() });

function genRef() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "SBR-";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, name, price_try, active")
      .eq("id", data.productId)
      .single();
    if (pErr || !product || !product.active) throw new Error("Ürün bulunamadı.");

    const referenceCode = genRef();
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        product_id: product.id,
        price_try: product.price_try,
        reference_code: referenceCode,
        status: "pending",
      })
      .select("id, reference_code")
      .single();
    if (error) throw new Error(error.message);

    // Fire-and-forget Telegram notification
    try {
      const { notifyTelegram, orderCreatedMessage } = await import("@/lib/telegram.server");
      await notifyTelegram(orderCreatedMessage({
        reference: order.reference_code,
        productName: product.name,
        priceTry: Number(product.price_try),
        userEmail: (claims as { email?: string } | null)?.email ?? null,
      }));
    } catch (e) { console.error("[notify] createOrder", (e as Error).message); }

    return { orderId: order.id, referenceCode: order.reference_code };
  });

const markPaidInput = z.object({ orderId: z.string().uuid(), receiptPath: z.string().min(1) });

export const markOrderPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => markPaidInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { error } = await supabase
      .from("orders")
      .update({ receipt_path: data.receiptPath, status: "reviewing" })
      .eq("id", data.orderId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    try {
      const { data: o } = await supabase
        .from("orders")
        .select("reference_code, price_try, product:products(name)")
        .eq("id", data.orderId)
        .single();
      if (o) {
        const { notifyTelegram, receiptUploadedMessage } = await import("@/lib/telegram.server");
        await notifyTelegram(receiptUploadedMessage({
          reference: o.reference_code,
          productName: (o.product as unknown as { name: string } | null)?.name ?? "—",
          priceTry: Number(o.price_try),
          userEmail: (claims as { email?: string } | null)?.email ?? null,
        }));
      }
    } catch (e) { console.error("[notify] markOrderPaid", (e as Error).message); }

    return { ok: true };
  });

const noteInput = z.object({ orderId: z.string().uuid(), note: z.string().min(1).max(1000) });

export const setOrderUserNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => noteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("orders")
      .update({ user_note: data.note })
      .eq("id", data.orderId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const approveInput = z.object({ orderId: z.string().uuid() });

export const approveOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => approveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { data: result, error } = await supabase.rpc("approve_order", { _order_id: data.orderId });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : null;
    return {
      ok: true,
      licenseKey: row?.license_key ?? null,
      activationToken: row?.activation_token ?? null,
    };
  });

const rejectInput = z.object({ orderId: z.string().uuid(), note: z.string().max(500).optional() });

export const rejectOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rejectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { error } = await supabase
      .from("orders")
      .update({ status: "rejected", admin_note: data.note ?? null })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const finalizeFreeInput = z.object({ orderId: z.string().uuid() });

export const finalizeFreeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => finalizeFreeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("finalize_free_order", {
      _order_id: data.orderId,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      ok: true,
      licenseKey: row?.license_key ?? null,
      activationToken: row?.activation_token ?? null,
    };
  });

const importKeysInput = z.object({
  productId: z.string().uuid(),
  keys: z.array(z.string().min(4).max(200)).min(1).max(2000),
});

export const importLicenseKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importKeysInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const rows = [...new Set(data.keys.map((k) => k.trim()).filter(Boolean))].map((key_value) => ({
      product_id: data.productId,
      key_value,
    }));
    const { error, count } = await supabase
      .from("license_keys")
      .upsert(rows, { onConflict: "key_value", ignoreDuplicates: true, count: "exact" });
    if (error) throw new Error(error.message);
    return { inserted: count ?? rows.length };
  });

const productInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/),
  description: z.string().max(1000).optional(),
  duration: z.enum(["hourly", "daily", "weekly", "monthly", "yearly", "lifetime"]),
  delivery_type: z.enum(["key", "account", "link", "link_token"]).default("key"),
  price_try: z.number().min(0).max(1000000),
  active: z.boolean(),
  category: z.string().max(80).optional().nullable(),
  manual_fulfillment: z.boolean().optional(),
  stock_hint: z.number().int().min(0).max(100000).optional().nullable(),
  featured: z.boolean().optional(),
  unlimited_stock: z.boolean().optional(),
  sort_order: z.number().int().min(-9999).max(9999).optional(),
  tier: z.enum(["standard", "epic"]).optional(),
  image_url: z.union([z.string().url().max(500), z.string().max(0), z.string().regex(/^\/[\w\-\/.]+$/)]).optional().nullable(),
});

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => productInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    if (data.id) {
      const { error } = await supabase.from("products").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("products").insert(data);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const deleteProductInput = z.object({ id: z.string().uuid() });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteProductInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { error } = await supabase.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const bankInput = z.object({
  id: z.string().uuid().optional(),
  bank_name: z.string().min(2).max(120),
  iban: z.string().min(10).max(64),
  holder_name: z.string().min(2).max(120),
  active: z.boolean(),
});

export const upsertBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bankInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    if (data.id) {
      const { error } = await supabase.from("bank_accounts").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("bank_accounts").insert(data);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* ============ PROMO CODES ============ */

const applyPromoInput = z.object({
  orderId: z.string().uuid(),
  code: z.string().min(2).max(64),
});

export const applyPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => applyPromoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("apply_promo_code", {
      _order_id: data.orderId,
      _code: data.code,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      discountTry: Number(row?.discount_try ?? 0),
      finalPrice: Number(row?.final_price ?? 0),
      code: (row?.code as string) ?? data.code,
    };
  });

const removePromoInput = z.object({ orderId: z.string().uuid() });

export const removePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => removePromoInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("remove_promo_code", { _order_id: data.orderId });
    if (error) throw new Error(error.message);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => promoUpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const payload = { ...data, code: data.code.toUpperCase().trim() };
    if (data.id) {
      const { error } = await supabase.from("promo_codes").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("promo_codes").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const promoDeleteInput = z.object({ id: z.string().uuid() });

export const deletePromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => promoDeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { error } = await supabase.from("promo_codes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

