import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
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
      .select("id, name, price_try, active, manual_fulfillment, unlimited_stock, source, external_id, external_price, supplier_out_of_stock")
      .eq("id", data.productId)
      .single();
    if (pErr || !product || !product.active) throw new Error("Ürün bulunamadı.");
    if (product.supplier_out_of_stock) {
      throw new Error(`"${product.name}" tedarikçide geçici olarak stokta yok. Stok döndüğünde otomatik olarak tekrar satışa açılacak.`);
    }


    // Stok ön-kontrolü: manuel değil ve sınırsız değilse, havuzda kullanılabilir key var mı?
    // Uniquelisans ürünleri için havuz boşsa API'den çekileceği için bu kontrolü atlıyoruz;
    // UL canlı stok kontrolü aşağıda ayrıca yapılıyor.
    const isUlProduct = product.source === "uniquelisans" && !!product.external_id;
    if (!product.manual_fulfillment && !product.unlimited_stock && !isUlProduct) {
      const { count } = await supabase
        .from("license_keys")
        .select("id", { count: "exact", head: true })
        .eq("product_id", product.id)
        .eq("status", "available");
      if (!count || count === 0) {
        try {
          const { notifyTelegram, outOfStockAlertMessage } = await import("@/lib/telegram.server");
          await notifyTelegram(outOfStockAlertMessage({
            productName: product.name,
            userEmail: (claims as { email?: string } | null)?.email ?? null,
          }));
        } catch (e) { console.error("[notify] outOfStock", (e as Error).message); }
        throw new Error(
          `"${product.name}" şu an stokta yok. Yöneticiye bildirim gönderildi — kısa süre içinde yeniden stoklanacak. Havale ile ön sipariş için destekle iletişime geçebilirsin.`
        );
      }
    }

    // Uniquelisans canlı stok/bakiye kontrolü (fail-open: API erişilemezse engellemez)
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
            await notifyTelegram(outOfStockAlertMessage({
              productName: `${product.name} (Uniquelisans)`,
              userEmail: (claims as { email?: string } | null)?.email ?? null,
            }));
          } catch { /* ignore */ }
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
          } catch { /* ignore */ }
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
        await logSupplierCheck({
          user_id: userId,
          product_id: product.id,
          product_name: product.name,
          external_id: product.external_id,
          blocked: false,
          context: "single_order",
          error: (e as Error).message,
        });
      }
    }



    const referenceCode = genRef();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
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

    // Aktif flash indirimi otomatik uygula
    try {
      await applyFlashDiscountToOrder(supabase, order.id, [
        { productId: product.id, quantity: 1, unitPriceTry: Number(product.price_try) },
      ]);
    } catch (e) {
      console.error("[flash] apply", (e as Error).message);
    }

    // NOT: "Satın al" tıklamasında TG bildirimi yollamıyoruz. Sadece
    // başarılı sipariş (ödeme/dekont sonrası) admin'e bildiriliyor.
    void claims;




    return { orderId: order.id, referenceCode: order.reference_code };
  });


/* ============ CART / MULTI-ITEM ORDERS ============ */

const cartOrderInput = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .min(1)
    .max(20),
  couponCode: z.string().trim().min(1).max(50).optional().nullable(),
});

export const createCartOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => cartOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;

    // Uniquelisans canlı stok/bakiye ön-kontrolü (fail-open)
    const userId = (context as { userId?: string }).userId ?? null;
    try {
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, source, external_id, external_price, supplier_out_of_stock")
        .in("id", data.items.map((i) => i.productId));
      const oos = (prods ?? []).find((p) => p.supplier_out_of_stock);
      if (oos) {
        throw new Error(`"${oos.name}" tedarikçide geçici olarak stokta yok. Sepetten çıkarıp daha sonra tekrar deneyebilirsin.`);
      }
      const ulProds = (prods ?? []).filter(
        (p) => p.source === "uniquelisans" && p.external_id,
      );
      if (ulProds.length > 0) {

        const { ulCheckAvailability, ulGetBalance, logSupplierCheck } = await import(
          "@/lib/uniquelisans.server"
        );
        let totalCost = 0;
        const checked: Array<{
          p: typeof ulProds[number];
          qty: number;
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
            qty,
            amount: amt,
            stock_count: avail.stock_count ?? null,
            is_stock: avail.is_stock ?? null,
          });
        }
        const bal = totalCost > 0 ? await ulGetBalance() : null;
        const balanceOk = bal === null || totalCost <= 0 ? null : bal >= totalCost;
        if (balanceOk === false) {
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
              balance_ok: false,
              blocked: true,
              block_reason: "insufficient_balance",
              context: "cart_order",
            });
          }
          try {
            const { notifyTelegram } = await import("@/lib/telegram.server");
            await notifyTelegram(
              `⚠️ Uniquelisans bakiyesi yetersiz (sepet) — ${(bal ?? 0).toFixed(2)} < ${totalCost.toFixed(2)}`,
            );
          } catch { /* ignore */ }
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



    const { data: rows, error } = await supabase.rpc("create_cart_order", {
      _items: data.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      // biome-ignore lint/suspicious/noExplicitAny: rpc signature updated
      _coupon_code: (data.couponCode ?? null) as any,
    } as never);
    if (error) throw new Error(error.message);

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.order_id) throw new Error("Sipariş oluşturulamadı.");

    // Aktif flash indirimlerini order_discounts'a yaz
    try {
      const { data: prods } = await supabase
        .from("products")
        .select("id, price_try")
        .in("id", data.items.map((i) => i.productId));
      const priceMap = new Map<string, number>((prods ?? []).map((p) => [p.id, Number(p.price_try)]));
      await applyFlashDiscountToOrder(
        supabase,
        row.order_id as string,
        data.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPriceTry: priceMap.get(i.productId) ?? 0,
        })),
      );
    } catch (e) {
      console.error("[flash] apply cart", (e as Error).message);
    }

    // NOT: Sepet siparişi oluşturulduğunda TG bildirimi göndermiyoruz.
    // Sadece ödeme/dekont sonrası "başarılı sipariş" bildirilir.
    void claims;




    return {
      orderId: row.order_id as string,
      referenceCode: row.reference_code as string,
      totalTry: Number(row.total_try),
    };
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

const checkoutFieldsInput = z.object({
  orderId: z.string().uuid(),
  fields: z.record(z.string(), z.string().max(2000)),
});

/**
 * Müşteri, Uniquelisans kaynaklı ürünlerde ödeme sayfasında gereken bilgileri
 * (email/link/wordpress vs.) buradan gönderir. Admin onayında API'ye iletilir.
 */
export const setOrderCheckoutFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => checkoutFieldsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.fields)) {
      const key = String(k).trim().slice(0, 64);
      const val = String(v ?? "").trim().slice(0, 2000);
      if (key && val) clean[key] = val;
    }
    const { error } = await supabase
      .from("orders")
      .update({ checkout_fields: clean })
      .eq("id", data.orderId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });



/**
 * After key assignment, check whether any product in the order dropped below
 * its low_stock_threshold and notify the admin via Telegram (throttled server-side).
 * Fire-and-forget: never blocks the caller.
 */
export async function notifyLowStockForOrder(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  orderId: string,
): Promise<void> {
  try {
    const [{ data: order }, { data: items }] = await Promise.all([
      supabase.from("orders").select("product_id").eq("id", orderId).maybeSingle(),
      supabase.from("order_items").select("product_id").eq("order_id", orderId),
    ]);
    const productIds = new Set<string>();
    if (order?.product_id) productIds.add(order.product_id);
    (items ?? []).forEach((i: { product_id: string | null }) => {
      if (i.product_id) productIds.add(i.product_id);
    });

    for (const pid of productIds) {
      const { data } = await supabase.rpc("check_low_stock_after_assign", { _product_id: pid });
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.should_alert) {
        const { notifyTelegram, lowStockAlertMessage } = await import("@/lib/telegram.server");
        await notifyTelegram(
          lowStockAlertMessage({
            productName: row.product_name ?? "—",
            available: Number(row.available ?? 0),
            threshold: Number(row.threshold ?? 0),
          }),
        );
      }
    }
  } catch (e) {
    console.error("[notify] lowStock", (e as Error).message);
  }
}

const approveInput = z.object({ orderId: z.string().uuid() });

export const approveOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => approveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");

    // Ürün Uniquelisans kaynaklıysa → API'den otomatik satın al ve teslim et
    const { data: ord } = await supabase
      .from("orders")
      .select("id, user_id, reference_code, status, product_id, checkout_fields, product:products(id, name, source, external_id, required_fields, delivery_type)")
      .eq("id", data.orderId)
      .single();

    const product = ord?.product as {
      id: string; name: string; source: string | null; external_id: string | null;
      required_fields: unknown; delivery_type: string;
    } | null;

    if (product?.source === "uniquelisans" && product.external_id) {
      if (ord?.status === "approved") throw new Error("Sipariş zaten onaylı.");
      const required = (product.required_fields ?? []) as Array<{ name: string; required?: boolean }>;
      const supplied = (ord?.checkout_fields ?? {}) as Record<string, string>;
      const missing = required
        .filter((r) => r?.required !== false)
        .map((r) => r.name)
        .filter((n) => !supplied[n] || String(supplied[n]).trim() === "");
      if (missing.length > 0) {
        throw new Error(
          `Müşteri gerekli bilgileri girmemiş: ${missing.join(", ")}. Onaylamadan önce müşteriden istemelisin.`,
        );
      }

      // Havuz-önceliği: UL ürünü olsa bile lokal havuzda "available" key varsa
      // API'yi çağırmadan doğrudan havuzdan teslim et (bakiye harcamamak için).
      {
        const { data: pooled } = await supabase
          .from("license_keys")
          .select("id, key_value")
          .eq("product_id", product.id)
          .eq("status", "available")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (pooled?.id) {
          const { error: upErr } = await supabase
            .from("license_keys")
            .update({
              status: "assigned",
              assigned_order_id: data.orderId,
              assigned_at: new Date().toISOString(),
            })
            .eq("id", pooled.id)
            .eq("status", "available"); // race guard
          if (!upErr) {
            await supabase.from("order_keys").insert({ order_id: data.orderId, license_key_id: pooled.id });
            await supabase
              .from("orders")
              .update({
                status: "approved",
                approved_at: new Date().toISOString(),
                external_delivery_data: pooled.key_value,
                external_status: "pool",
                admin_note: "Havuzdan otomatik teslim (UL API çağrılmadı).",
              })
              .eq("id", data.orderId);
            try {
              if (ord?.user_id) {
                await supabase.rpc("push_notification" as never, {
                  _user_id: ord.user_id,
                  _type: "order_approved",
                  _title: "Siparişin onaylandı 🎉",
                  _body: `Ref: ${ord.reference_code} · Bilgilerin hesabında hazır.`,
                  _link: "/hesabim",
                } as never);
                await supabase.rpc("process_referral_bonus" as never, { _user_id: ord.user_id } as never);
              }
            } catch { /* ignore */ }
            try {
              const { notifyTelegram } = await import("@/lib/telegram.server");
              await notifyTelegram(`✅ Havuzdan teslim (UL ürünü) — Ref: ${ord?.reference_code}`);
            } catch { /* ignore */ }
            return { ok: true, source: "pool" as const };
          }
          // update başarısızsa API akışına düş
        }
      }

      const { ulBuy } = await import("@/lib/uniquelisans.server");
      let resp;
      try {
        resp = await ulBuy(Number(product.external_id), supplied);
      } catch (e) {
        // Ağ hatası → siparişi manuel inceleme olarak bırak
        await supabase
          .from("orders")
          .update({ status: "reviewing", admin_note: `API hatası: ${(e as Error).message}` })
          .eq("id", data.orderId);
        try {
          const { notifyTelegram } = await import("@/lib/telegram.server");
          await notifyTelegram(
            `⚠️ Uniquelisans otomatik alım başarısız — Ref: ${ord?.reference_code} · ${(e as Error).message}`,
          );
        } catch { /* ignore */ }
        throw new Error(`Uniquelisans API'ye ulaşılamadı: ${(e as Error).message}. Sipariş 'inceleniyor' bırakıldı.`);
      }

      // Hata durumları — sipariş inceleniyor kalır, admin manuel işlem yapar
      if (resp.status === "error" || resp.code === 402 || resp.code === 422 || (resp.code === 200 && resp.status !== "success" && resp.status !== "pending")) {
        const msg = resp.message
          || (resp.required_fields ? `Eksik alanlar: ${Object.keys(resp.required_fields).join(", ")}` : "bilinmeyen hata");
        await supabase
          .from("orders")
          .update({
            status: "reviewing",
            admin_note: `Uniquelisans: ${msg}`,
            external_status: resp.status,
          })
          .eq("id", data.orderId);
        try {
          const { notifyTelegram } = await import("@/lib/telegram.server");
          await notifyTelegram(
            `⚠️ Uniquelisans otomatik alım hatası — Ref: ${ord?.reference_code} · ${msg}`,
          );
        } catch { /* ignore */ }
        throw new Error(`Uniquelisans: ${msg}. Sipariş 'inceleniyor' bırakıldı, manuel devam edebilirsin.`);
      }

      // Başarılı ama stok yok (pending) — API teslim edecek, biz de manuel bekle
      if (resp.status === "pending") {
        await supabase
          .from("orders")
          .update({
            external_order_id: resp.order_id ? String(resp.order_id) : null,
            external_status: "pending",
            admin_note: "Uniquelisans: stok yok, tedarikçi hazırlıyor (pending).",
          })
          .eq("id", data.orderId);
        try {
          const { notifyTelegram } = await import("@/lib/telegram.server");
          await notifyTelegram(
            `⏳ Uniquelisans stok yok/beklemede — Ref: ${ord?.reference_code} · ext order: ${resp.order_id}`,
          );
        } catch { /* ignore */ }
        throw new Error("Uniquelisans stoğu şu an yok — tedarikçi 'pending' verdi. Sipariş 'inceleniyor' kalıyor.");
      }

      // Başarılı teslim — delivery_data'yı license_key olarak kaydet ve siparişi onayla
      const deliveryData = (resp.delivery_data ?? "").toString().trim();
      if (!deliveryData) throw new Error("Uniquelisans teslim verisi boş döndü.");

      const { data: keyRow, error: keyErr } = await supabase
        .from("license_keys")
        .insert({
          product_id: product.id,
          key_value: deliveryData,
          status: "assigned",
          assigned_order_id: data.orderId,
          assigned_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (keyErr) throw new Error(`Key kaydedilemedi: ${keyErr.message}`);

      await supabase.from("order_keys").insert({ order_id: data.orderId, license_key_id: keyRow.id });
      await supabase
        .from("orders")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          external_order_id: resp.order_id ? String(resp.order_id) : null,
          external_delivery_data: deliveryData,
          external_status: "success",
        })
        .eq("id", data.orderId);

      // Bildirimler
      try {
        if (ord?.user_id) {
          await supabase.rpc("push_notification" as never, {
            _user_id: ord.user_id,
            _type: "order_approved",
            _title: "Siparişin onaylandı 🎉",
            _body: `Ref: ${ord.reference_code} · Bilgilerin hesabında hazır.`,
            _link: "/hesabim",
          } as never);
          await supabase.rpc("process_referral_bonus" as never, { _user_id: ord.user_id } as never);
        }
      } catch (e) { console.error("[notify] approveOrder(UL)", (e as Error).message); }

      return { ok: true, licenseKey: deliveryData, activationToken: null };
    }

    // Standart yol — yerel key havuzundan ata
    const { data: result, error } = await supabase.rpc("approve_order", { _order_id: data.orderId });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : null;
    await notifyLowStockForOrder(supabase, data.orderId);

    // Push bildirim + referral bonus (owner user'a) + admin Telegram
    try {
      const { data: ord2 } = await supabase
        .from("orders")
        .select("user_id, reference_code, price_try, product:products(name)")
        .eq("id", data.orderId)
        .single();
      if (ord2?.user_id) {
        await supabase.rpc("push_notification" as never, {
          _user_id: ord2.user_id,
          _type: "order_approved",
          _title: "Siparişin onaylandı 🎉",
          _body: `Ref: ${ord2.reference_code} · Anahtarların hesabında hazır.`,
          _link: "/hesabim",
        } as never);
        await supabase.rpc("process_referral_bonus" as never, { _user_id: ord2.user_id } as never);
      }
      try {
        const { notifyTelegram } = await import("@/lib/telegram.server");
        const pname = (ord2?.product as unknown as { name?: string } | null)?.name ?? "—";
        await notifyTelegram(
          `🎉 <b>Sipariş onaylandı</b>\n` +
          `📦 ${pname}\n` +
          `💰 ₺${Number(ord2?.price_try ?? 0).toLocaleString("tr-TR")}\n` +
          `🔖 <code>${ord2?.reference_code ?? ""}</code>`,
        );
      } catch (e) { console.error("[tg] approveOrder", (e as Error).message); }
    } catch (e) { console.error("[notify] approveOrder", (e as Error).message); }

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

    const { data: ord } = await supabase
      .from("orders")
      .select("paid_with, status")
      .eq("id", data.orderId)
      .single();
    let refunded = false;
    if (ord?.paid_with === "wallet" && ord.status !== "rejected") {
      const { error: refErr } = await supabase.rpc("refund_order_to_wallet", {
        _order_id: data.orderId,
      });
      if (refErr) throw new Error("İade başarısız: " + refErr.message);
      refunded = true;
    }

    const { error } = await supabase
      .from("orders")
      .update({ status: "rejected", admin_note: data.note ?? null })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true, refunded };
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
    await notifyLowStockForOrder(supabase, data.orderId);
    return {
      ok: true,
      licenseKey: row?.license_key ?? null,
      activationToken: row?.activation_token ?? null,
    };
  });

const importKeysInput = z.object({
  productId: z.string().uuid(),
  keys: z.array(z.string().min(4).max(4000)).min(1).max(2000),
  sharedCount: z.number().int().min(0).max(100000).optional(),
});

export const importLicenseKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importKeysInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");

    // Shared key mode: her key için sharedCount adet kopya (aynı key_value, is_shared=true).
    const shared = Math.max(0, Math.floor(data.sharedCount ?? 0));
    if (shared > 0) {
      const uniqueKeys = [...new Set(data.keys.map((k) => k.trim()).filter(Boolean))];
      const rows: Array<{ product_id: string; key_value: string; is_shared: boolean }> = [];
      for (const key_value of uniqueKeys) {
        for (let i = 0; i < shared; i++) {
          rows.push({ product_id: data.productId, key_value, is_shared: true });
        }
      }
      const { error, count } = await supabase
        .from("license_keys")
        .insert(rows, { count: "exact" });
      if (error) throw new Error(error.message);
      return { inserted: count ?? rows.length, submitted: rows.length };
    }

    const uniqueKeys = [...new Set(data.keys.map((k) => k.trim()).filter(Boolean))];
    if (uniqueKeys.length === 0) return { inserted: 0, submitted: 0 };

    // Partial unique index (WHERE is_shared IS NOT TRUE) — ON CONFLICT cannot
    // target it via PostgREST, so dedupe against existing rows manually.
    const { data: existing, error: existErr } = await supabase
      .from("license_keys")
      .select("key_value")
      .eq("product_id", data.productId)
      .neq("is_shared", true)
      .in("key_value", uniqueKeys);
    if (existErr) throw new Error(existErr.message);
    const already = new Set((existing ?? []).map((r: { key_value: string }) => r.key_value));
    const rows = uniqueKeys
      .filter((k) => !already.has(k))
      .map((key_value) => ({ product_id: data.productId, key_value }));
    if (rows.length === 0) return { inserted: 0, submitted: uniqueKeys.length };
    const { error, count } = await supabase
      .from("license_keys")
      .insert(rows, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inserted: count ?? rows.length, submitted: uniqueKeys.length };
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
  image_url: z.union([z.string().url().max(500), z.string().max(0), z.string().regex(/^\/[\w\-\/.]+$/)]).optional().nullable(),
  shopier_url: z.union([z.string().url().max(500), z.string().max(0)]).optional().nullable(),
  requires_email: z.boolean().optional(),
});

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => productInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const isNew = !data.id;
    if (data.id) {
      const { error } = await supabase.from("products").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("products").insert(data);
      if (error) throw new Error(error.message);
    }
    if (isNew && data.active) {
      try {
        const tg = await import("@/lib/telegram.server");
        await tg.postToChannel(tg.productAnnouncement({
          name: data.name,
          slug: data.slug,
          priceTry: Number(data.price_try),
          description: data.description ?? null,
          category: data.category ?? null,
          imageUrl: data.image_url ?? null,
        }));
      } catch (e) { console.error("[notify] newProduct", (e as Error).message); }
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
    const isNew = !data.id;
    if (data.id) {
      const { error } = await supabase.from("promo_codes").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("promo_codes").insert(payload);
      if (error) throw new Error(error.message);
    }
    if (isNew && data.active) {
      try {
        let productName: string | null = null;
        let productSlug: string | null = null;
        if (data.product_id) {
          const { data: p } = await supabase.from("products").select("name,slug").eq("id", data.product_id).single();
          productName = p?.name ?? null;
          productSlug = p?.slug ?? null;
        }
        const tg = await import("@/lib/telegram.server");
        await tg.postToChannel(tg.promoAnnouncement({
          code: payload.code,
          discountType: data.discount_type,
          discountValue: Number(data.discount_value),
          productName,
          productSlug,
          minAmount: data.min_amount ?? 0,
          expiresAt: data.expires_at ?? null,
          maxUses: data.max_uses ?? null,
        }));
      } catch (e) { console.error("[notify] newPromo", (e as Error).message); }
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


/**
 * Sipariş için aktif flash indirimlerini order_discounts tablosuna yazar.
 * Kupon akışıyla uyumlu (SUM(discount_try) final fiyattan düşülüyor).
 */
async function applyFlashDiscountToOrder(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  orderId: string,
  items: Array<{ productId: string; quantity: number; unitPriceTry: number }>,
): Promise<void> {
  if (items.length === 0) return;
  const nowIso = new Date().toISOString();
  const { data: sales } = await supabase
    // biome-ignore lint/suspicious/noExplicitAny: table not in generated types
    .from("flash_sales" as any)
    .select("id, product_id, discount_type, discount_value, ends_at")
    .in("product_id", items.map((i) => i.productId))
    .eq("is_active", true)
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso);
  const rows = (sales ?? []) as Array<{
    id: string; product_id: string; discount_type: "percent" | "amount"; discount_value: number;
  }>;
  if (rows.length === 0) return;
  const bestByProduct = new Map<string, { saleId: string; saved: number }>();
  for (const it of items) {
    const applicable = rows.filter((r) => r.product_id === it.productId);
    if (applicable.length === 0) continue;
    let best: { saleId: string; saved: number } | null = null;
    for (const r of applicable) {
      const raw = r.discount_type === "percent"
        ? it.unitPriceTry * (Number(r.discount_value) / 100)
        : Number(r.discount_value);
      const perUnit = Math.max(0, Math.min(it.unitPriceTry, raw));
      const saved = Math.round(perUnit * it.quantity * 100) / 100;
      if (saved > 0 && (!best || saved > best.saved)) best = { saleId: r.id, saved };
    }
    if (best) bestByProduct.set(it.productId, best);
  }
  const inserts = Array.from(bestByProduct.values()).map((v) => ({
    order_id: orderId,
    code_snapshot: `FLASH-${v.saleId.slice(0, 8)}`,
    discount_try: v.saved,
  }));
  if (inserts.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("order_discounts").insert(inserts);
}


const addItemInput = z.object({
  orderId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20).default(1),
});

export const addItemToOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addItemInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("add_item_to_order", {
      _order_id: data.orderId,
      _product_id: data.productId,
      _quantity: data.quantity,
    // biome-ignore lint/suspicious/noExplicitAny: rpc typing
    } as any);
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { orderId: row?.out_order_id as string, totalTry: Number(row?.out_total_try ?? 0) };
  });

const removeItemInput = z.object({
  orderId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export const removeItemFromOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => removeItemInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("remove_item_from_order", {
      _order_id: data.orderId,
      _item_id: data.itemId,
    // biome-ignore lint/suspicious/noExplicitAny: rpc typing
    } as any);
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      orderId: row?.order_id as string,
      totalTry: Number(row?.total_try ?? 0),
      itemsLeft: Number(row?.items_left ?? 0),
    };
  });

const cancelOrderInput = z.object({ orderId: z.string().uuid() });

export const cancelPendingOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => cancelOrderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("cancel_pending_order", {
      _order_id: data.orderId,
    // biome-ignore lint/suspicious/noExplicitAny: rpc typing
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const adminCancelInput = z.object({
  orderId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

export const adminCancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adminCancelInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { data: res, error } = await supabase.rpc("admin_cancel_order", {
      _order_id: data.orderId,
      _note: data.note ?? null,
    // biome-ignore lint/suspicious/noExplicitAny: rpc typing
    } as any);
    if (error) throw new Error(error.message);
    return res as { ok: boolean; refunded_try: number; released_keys: number };
  });


