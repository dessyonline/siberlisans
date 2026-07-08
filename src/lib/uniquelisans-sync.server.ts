// Server-only: Uniquelisans "pending" siparişlerini polling ile senkronize eder.
// Sadece server function/route içinden dynamic import ile kullan.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ulOrderStatus } from "@/lib/uniquelisans.server";

export type SyncOutcome =
  | { orderId: string; ref: string; result: "delivered"; deliveryData: string }
  | { orderId: string; ref: string; result: "still_pending" }
  | { orderId: string; ref: string; result: "error"; message: string }
  | { orderId: string; ref: string; result: "skipped"; reason: string };

/**
 * Tek bir siparişi UL'den yeniden sorgular. "success" dönerse license_key oluşturup
 * siparişi onaylar; "pending" ise dokunmaz; "error" ise admin_note'a yazar.
 */
export async function reconcileUniquelisansOrder(
  supabase: SupabaseClient,
  orderId: string,
): Promise<SyncOutcome> {
  const { data: ord, error: ordErr } = await supabase
    .from("orders")
    .select("id, user_id, reference_code, status, product_id, external_order_id, external_status")
    .eq("id", orderId)
    .single();
  if (ordErr || !ord) return { orderId, ref: "-", result: "skipped", reason: "sipariş bulunamadı" };
  if (!ord.external_order_id) {
    return { orderId, ref: ord.reference_code, result: "skipped", reason: "external_order_id yok" };
  }
  if (ord.status === "approved") {
    return { orderId, ref: ord.reference_code, result: "skipped", reason: "zaten onaylı" };
  }
  if (ord.status === "rejected") {
    return { orderId, ref: ord.reference_code, result: "skipped", reason: "reddedilmiş" };
  }

  let resp;
  try {
    resp = await ulOrderStatus(ord.external_order_id);
  } catch (e) {
    const msg = (e as Error).message;
    await supabase
      .from("orders")
      .update({ admin_note: `Sync hatası: ${msg}` })
      .eq("id", orderId);
    return { orderId, ref: ord.reference_code, result: "error", message: msg };
  }

  const status = String(resp.status || "").toLowerCase();

  if (status === "pending") {
    await supabase
      .from("orders")
      .update({ external_status: "pending" })
      .eq("id", orderId);
    return { orderId, ref: ord.reference_code, result: "still_pending" };
  }

  if (status === "success") {
    const deliveryData = (resp.delivery_data ?? "").toString().trim();
    if (!deliveryData) {
      await supabase
        .from("orders")
        .update({ admin_note: "Sync: success ama delivery_data boş", external_status: "success" })
        .eq("id", orderId);
      return { orderId, ref: ord.reference_code, result: "error", message: "delivery_data boş" };
    }

    // License key + order_keys kaydı
    const { data: keyRow, error: keyErr } = await supabase
      .from("license_keys")
      .insert({
        product_id: ord.product_id,
        key_value: deliveryData,
        status: "assigned",
        assigned_order_id: orderId,
        assigned_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (keyErr) {
      return { orderId, ref: ord.reference_code, result: "error", message: `key kaydedilemedi: ${keyErr.message}` };
    }
    await supabase.from("order_keys").insert({ order_id: orderId, license_key_id: keyRow.id });

    await supabase
      .from("orders")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        external_delivery_data: deliveryData,
        external_status: "success",
        admin_note: null,
      })
      .eq("id", orderId);

    // Bildirimler
    try {
      if (ord.user_id) {
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
      await notifyTelegram(`✅ Uniquelisans otomatik teslim tamamlandı — Ref: ${ord.reference_code}`);
    } catch { /* ignore */ }

    return { orderId, ref: ord.reference_code, result: "delivered", deliveryData };
  }

  // error / diğer
  const msg = resp.message || `bilinmeyen durum: ${resp.status}`;
  await supabase
    .from("orders")
    .update({
      external_status: resp.status ?? "error",
      admin_note: `Uniquelisans: ${msg}`,
    })
    .eq("id", orderId);
  return { orderId, ref: ord.reference_code, result: "error", message: msg };
}

/**
 * "reviewing" durumunda external_order_id'si olan tüm UL siparişlerini senkronize eder.
 */
export async function reconcileAllPendingUniquelisans(
  supabase: SupabaseClient,
  limit = 50,
): Promise<{ scanned: number; outcomes: SyncOutcome[] }> {
  const { data: rows, error } = await supabase
    .from("orders")
    .select("id")
    .eq("status", "reviewing")
    .not("external_order_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  const outcomes: SyncOutcome[] = [];
  for (const r of rows ?? []) {
    outcomes.push(await reconcileUniquelisansOrder(supabase, r.id));
  }
  return { scanned: outcomes.length, outcomes };
}
