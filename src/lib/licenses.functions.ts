import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MyLicense = {
  id: string;
  key_value: string;
  status: string;
  hwid: string | null;
  activated_at: string | null;
  assigned_at: string | null;
  expires_at: string | null;
  duration_days: number | null;
  duration_minutes: number | null;
  last_validated_at: string | null;
  revoked: boolean;
  activation_token: string | null;
  order_id: string | null;
  order_reference: string | null;
  product: { id: string; name: string; slug: string; delivery_type: string } | null;
};

/**
 * Kullanıcının satın aldığı lisans anahtarlarını (order_keys üzerinden) döndürür.
 */
export const listMyLicenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: orders, error: oErr } = await supabase
      .from("orders")
      .select("id, reference_code")
      .eq("user_id", userId)
      .eq("status", "approved");
    if (oErr) throw oErr;
    if (!orders || orders.length === 0) return [] as MyLicense[];

    const orderIds = orders.map((o) => o.id);
    const refByOrder = new Map(orders.map((o) => [o.id, o.reference_code as string]));

    const { data: ok, error: kErr } = await supabase
      .from("order_keys")
      .select(
        "order_id, license_key:license_keys(id, key_value, status, hwid, activated_at, assigned_at, expires_at, duration_days, duration_minutes, last_validated_at, revoked, activation_token, product:products(id, name, slug, delivery_type))",
      )
      .in("order_id", orderIds);
    if (kErr) throw kErr;

    const rows: MyLicense[] = [];
    for (const r of ok ?? []) {
      const lk = (r as unknown as { license_key: MyLicense | null }).license_key;
      if (!lk) continue;
      rows.push({
        ...lk,
        order_id: r.order_id,
        order_reference: refByOrder.get(r.order_id) ?? null,
      });
    }
    return rows.sort((a, b) => (b.assigned_at ?? "").localeCompare(a.assigned_at ?? ""));
  });

/**
 * Kullanıcı kendi lisansındaki HWID'yi sıfırlar. Yalnızca sahibi çağırabilir.
 * 24 saatte 1 defa kullanılabilir (spam koruması).
 */
export const releaseMyHwid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ license_key_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Sahiplik kontrolü: order_keys -> orders.user_id + key_value
    const { data: check, error: cErr } = await supabase
      .from("order_keys")
      .select("license_key_id, license_key:license_keys(key_value), order:orders!inner(user_id)")
      .eq("license_key_id", data.license_key_id)
      .limit(1)
      .maybeSingle();
    if (cErr) throw cErr;
    const row = check as unknown as {
      order: { user_id: string } | null;
      license_key: { key_value: string } | null;
    } | null;
    const ownerId = row?.order?.user_id;
    const keyValue = row?.license_key?.key_value;
    if (!ownerId || ownerId !== userId || !keyValue) {
      throw new Error("Bu lisans size ait değil.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Rate limit: son 24 saat içinde reset yapıldıysa reddet
    const { data: last } = await supabaseAdmin
      .from("license_events")
      .select("created_at")
      .eq("license_key", keyValue)
      .eq("event", "hwid_reset")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.created_at) {
      const diff = Date.now() - new Date(last.created_at).getTime();
      if (diff < 24 * 3600 * 1000) {
        const hoursLeft = Math.ceil((24 * 3600 * 1000 - diff) / 3600000);
        throw new Error(`HWID sıfırlama 24 saatte bir yapılabilir. ${hoursLeft} saat sonra tekrar deneyin.`);
      }
    }

    const { error: uErr } = await supabaseAdmin
      .from("license_keys")
      .update({ hwid: null, activated_at: null })
      .eq("id", data.license_key_id);
    if (uErr) throw uErr;

    await supabaseAdmin.from("license_events").insert({
      license_key: keyValue,
      event: "hwid_reset",
      detail: "user_self_reset",
    });

    return { ok: true };
  });

