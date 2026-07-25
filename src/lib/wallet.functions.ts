import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Sabit paketler
export const TOPUP_PACKAGES = [250, 500, 1000, 2000] as const;

function genRef() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "TOP-";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createTopupInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: active, error: activeError } = await supabase
      .from("wallet_topups")
      .select("id, reference_code, amount_try, status")
      .eq("user_id", userId)
      .in("status", ["pending", "reviewing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeError) throw new Error(activeError.message);
    if (active) {
      return {
        topupId: active.id,
        referenceCode: active.reference_code,
        reused: true,
        amount: Number(active.amount_try ?? 0),
        status: active.status,
      };
    }

    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const ua = getRequestHeader("user-agent") ?? null;
    const { is_vpn, country } = await detectVpn(ip);

    const reference = genRef();
    const { data: row, error } = await supabase
      .from("wallet_topups")
      .insert({
        user_id: userId,
        amount_try: data.amount,
        reference_code: reference,
        status: "pending",
        client_ip: ip,
        user_agent: ua,
        is_vpn,
        ip_country: country,
      })
      .select("id, reference_code")
      .single();
    if (error) {
      const msg = error.message || "";
      if (/aktif_yukleme_talebi_var/i.test(msg)) {
        throw new Error("Zaten açık bir bakiye yükleme talebiniz var. Önce onu tamamlayın veya admin kararını bekleyin.");
      }
      if (/cok_sik_yukleme_talebi/i.test(msg)) {
        throw new Error("Çok sık bakiye yükleme talebi oluşturuyorsunuz. Lütfen 10 dakika sonra tekrar deneyin.");
      }
      if (/ip_cok_sik_talep/i.test(msg)) {
        throw new Error("Aynı ağdan çok sık yükleme talebi geliyor. 10 dakika sonra tekrar deneyin.");
      }
      if (/ip_bloklu/i.test(msg)) {
        throw new Error("IP adresiniz geçici olarak kısıtlandı (24 saat). Destek ile iletişime geçin.");
      }
      if (/vpn_algilandi/i.test(msg)) {
        throw new Error("VPN/Proxy üzerinden bakiye yükleme yapılamaz. Gerçek bağlantınızla tekrar deneyin.");
      }
      throw new Error(msg);
    }

    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      const { data: prof } = await supabase
        .from("profiles")
        .select("email, display_name")
        .eq("id", userId)
        .maybeSingle();
      const who = prof?.display_name || prof?.email || userId.slice(0, 8);
      await notifyTelegram(
        `🆕 <b>Yeni bakiye yükleme talebi</b>\n` +
        `👤 ${who}\n` +
        `💰 ₺${Number(data.amount).toLocaleString("tr-TR")}\n` +
        `🔖 <code>${row.reference_code}</code>\n` +
        `📶 IP: ${ip ?? "?"}${country ? ` (${country})` : ""}${is_vpn ? " ⚠️VPN" : ""}`,
      );
    } catch (e) { console.error("[tg] createTopup", (e as Error).message); }

    return { topupId: row.id, referenceCode: row.reference_code, reused: false, amount: data.amount, status: "pending" };
  });

const markTopupPaidInput = z.object({
  topupId: z.string().uuid(),
  receiptPath: z.string().min(1),
});

export const markTopupPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => markTopupPaidInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("wallet_topups")
      .update({ receipt_path: data.receiptPath, status: "reviewing", updated_at: new Date().toISOString() })
      .eq("id", data.topupId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    try {
      const { notifyTelegram } = await import("@/lib/telegram.server");
      const { data: t } = await supabase
        .from("wallet_topups")
        .select("reference_code, amount_try")
        .eq("id", data.topupId)
        .single();
      if (t) {
        await notifyTelegram(
          `📎 Bakiye dekontu yüklendi — ${t.reference_code} — ${t.amount_try} TL`,
        );
      }
    } catch (e) {
      console.error("[notify] markTopupPaid", (e as Error).message);
    }
    return { ok: true };
  });

const orderIdInput = z.object({ orderId: z.string().uuid() });

export const payOrderWithWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orderIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Pre-flight: ensure a license key is available before touching the wallet,
    // otherwise the DB function throws mid-transaction and the user sees a
    // confusing "stokta anahtar yok" runtime error.
    const { data: order } = await supabase
      .from("orders")
      .select("product_id, products(manual_fulfillment, unlimited_stock, name)")
      .eq("id", data.orderId)
      .maybeSingle();
    const product = (order?.products ?? null) as
      | { manual_fulfillment: boolean | null; unlimited_stock: boolean | null; name: string | null }
      | null;
    const needsStock = !!product && !product.manual_fulfillment && !product.unlimited_stock;
    if (needsStock && order?.product_id) {
      const { count } = await supabase
        .from("license_keys")
        .select("id", { head: true, count: "exact" })
        .eq("product_id", order.product_id)
        .eq("status", "available");
      if ((count ?? 0) === 0) {
        return {
          ok: false as const,
          error: `"${product?.name ?? "Ürün"}" için şu an stok bulunmuyor. Havale ile sipariş bırakabilir veya destek ile iletişime geçebilirsiniz.`,
          licenseKey: null,
          activationToken: null,
          balanceAfter: 0,
        };
      }
    }

    const { data: rows, error } = await supabase.rpc("pay_order_with_wallet", {
      _order_id: data.orderId,
    });
    if (error) {
      const msg = error.message || "";
      const friendly = /anahtar yok|stokta/i.test(msg)
        ? "Stok az önce tükendi. Bakiyeniz düşülmedi; lütfen havale ile ödeyin veya biraz sonra tekrar deneyin."
        : msg;
      return { ok: false as const, error: friendly, licenseKey: null, activationToken: null, balanceAfter: 0 };
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    try {
      const { notifyLowStockForOrder } = await import("@/lib/orders.functions");
      await notifyLowStockForOrder(supabase, data.orderId);
    } catch (e) { console.error("[notify] lowStock wallet", (e as Error).message); }

    // Push bildirim + referral bonus + admin Telegram
    try {
      const { data: ord } = await supabase
        .from("orders")
        .select("user_id, reference_code, price_try, product:products(name)")
        .eq("id", data.orderId)
        .single();
      if (ord?.user_id) {
        await supabase.rpc("push_notification" as never, {
          _user_id: ord.user_id,
          _type: "order_paid",
          _title: "Ödeme başarılı ✓",
          _body: `Ref: ${ord.reference_code} · Anahtarların hazır.`,
          _link: "/hesabim",
        } as never);
        await supabase.rpc("process_referral_bonus" as never, { _user_id: ord.user_id } as never);
      }
      try {
        const { notifyTelegram } = await import("@/lib/telegram.server");
        const pname = (ord?.product as unknown as { name?: string } | null)?.name ?? "—";
        await notifyTelegram(
          `✅ <b>Cüzdandan ödeme başarılı</b>\n` +
          `📦 ${pname}\n` +
          `💰 ₺${Number(ord?.price_try ?? 0).toLocaleString("tr-TR")}\n` +
          `🔖 <code>${ord?.reference_code ?? ""}</code>`,
        );
      } catch (e) { console.error("[tg] payWallet", (e as Error).message); }
    } catch (e) { console.error("[notify] payWallet", (e as Error).message); }

    return {
      ok: true as const,
      error: null,
      licenseKey: (row?.license_key as string) ?? null,
      activationToken: (row?.license_token as string) ?? null,
      balanceAfter: Number(row?.balance_after ?? 0),
    };
  });

const topupIdInput = z.object({ topupId: z.string().uuid() });

export const approveTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => topupIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { data: balance, error } = await supabase.rpc("approve_topup", { _topup_id: data.topupId });
    if (error) throw new Error(error.message);
    return { ok: true, balance: Number(balance ?? 0) };
  });

const rejectTopupInput = z.object({
  topupId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

export const rejectTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rejectTopupInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { error } = await supabase.rpc("reject_topup", {
      _topup_id: data.topupId,
      _note: data.note ?? "",
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

const adjustInput = z.object({
  userId: z.string().uuid(),
  delta: z.number().refine((v) => v !== 0 && Math.abs(v) <= 1000000, "Geçersiz tutar"),
  note: z.string().max(500).optional(),
});

export const adminAdjustWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => adjustInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { data: balance, error } = await supabase.rpc("admin_adjust_wallet", {
      _user_id: data.userId,
      _delta: data.delta,
      _note: data.note ?? "",
    });
    if (error) throw new Error(error.message);
    return { ok: true, balance: Number(balance ?? 0) };
  });
