import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// biome-ignore lint/suspicious/noExplicitAny: rpc typing
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("Yetki kontrol edilemedi");
  if (!data) throw new Error("Yetkisiz");
}

export type AdminOrderRow = {
  id: string;
  reference_code: string;
  status: string;
  price_try: number;
  discount_try: number;
  net_try: number;
  discount_codes: string[];
  paid_with: string | null;
  created_at: string;
  approved_at: string | null;
  user_note: string | null;
  admin_note: string | null;
  receipt_path: string | null;
  external_order_id: string | null;
  external_status: string | null;
  external_delivery_data: string | null;
  checkout_fields: Record<string, string> | null;
  product_id: string | null;
  product_name: string | null;
  product_source: string | null;
  manual_fulfillment: boolean;
  user_id: string | null;
  buyer_email: string | null;
  buyer_name: string | null;
};

const listInput = z.object({
  status: z.string().default("reviewing"),
  range: z.enum(["today", "7d", "30d", "all"]).default("all"),
  q: z.string().default(""),
  productId: z.string().default(""),
  paidWith: z.string().default(""),
  minAmount: z.number().nullable().default(null),
  maxAmount: z.number().nullable().default(null),
  onlyMessage: z.boolean().default(false),
  sort: z.enum(["created_at", "price_try", "status"]).default("created_at"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(10).max(200).default(50),
});

export const listAdminOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sel = (s: string): string => s;
    let q = supabaseAdmin
      .from("orders")
      .select(
        sel(
          "id, reference_code, status, price_try, paid_with, created_at, approved_at, user_note, admin_note, receipt_path, external_order_id, external_status, external_delivery_data, checkout_fields, product_id, user_id",
        ),
        { count: "exact" },
      );

    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.paidWith) q = q.eq("paid_with", data.paidWith);
    if (data.productId) q = q.eq("product_id", data.productId);
    if (data.minAmount != null) q = q.gte("price_try", data.minAmount);
    if (data.maxAmount != null) q = q.lte("price_try", data.maxAmount);
    if (data.onlyMessage) q = q.not("user_note", "is", null);
    if (data.range !== "all") {
      const days = data.range === "today" ? 1 : data.range === "7d" ? 7 : 30;
      q = q.gte("created_at", new Date(Date.now() - days * 864e5).toISOString());
    }

    const term = data.q.trim();
    let userIdFilter: string[] | null = null;
    if (term) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .or(`email.ilike.%${term}%,display_name.ilike.%${term}%`)
        .limit(50);
      userIdFilter = (profs ?? []).map((p) => p.id as string);
      const ors = [
        `reference_code.ilike.%${term}%`,
        `external_order_id.ilike.%${term}%`,
        `user_note.ilike.%${term}%`,
      ];
      if (userIdFilter.length) ors.push(`user_id.in.(${userIdFilter.join(",")})`);
      q = q.or(ors.join(","));
    }

    q = q.order(data.sort, { ascending: data.dir === "asc" });
    const from = (data.page - 1) * data.perPage;
    q = q.range(from, from + data.perPage - 1);

    type Raw = {
      id: string; reference_code: string; status: string; price_try: number;
      paid_with: string | null; created_at: string; approved_at: string | null;
      user_note: string | null; admin_note: string | null; receipt_path: string | null;
      external_order_id: string | null; external_status: string | null;
      external_delivery_data: string | null; checkout_fields: Record<string, string> | null;
      product_id: string | null; user_id: string | null;
    };
    const { data: rows, count, error } = await q.returns<Raw[]>();
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const productIds = Array.from(new Set(list.map((o) => o.product_id).filter(Boolean))) as string[];
    const userIds = Array.from(new Set(list.map((o) => o.user_id).filter(Boolean))) as string[];
    const orderIds = list.map((o) => o.id);

    const [{ data: products }, { data: profiles }, { data: discounts }] = await Promise.all([
      productIds.length
        ? supabaseAdmin.from("products").select("id, name, source, manual_fulfillment").in("id", productIds)
        : Promise.resolve({ data: [] as { id: string; name: string; source: string | null; manual_fulfillment: boolean }[] }),
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, email, display_name").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; email: string | null; display_name: string | null }[] }),
      orderIds.length
        ? supabaseAdmin.from("order_discounts").select("order_id, discount_try, code_snapshot").in("order_id", orderIds)
        : Promise.resolve({ data: [] as { order_id: string; discount_try: number; code_snapshot: string | null }[] }),
    ]);

    const pMap = new Map((products ?? []).map((p) => [p.id, p]));
    const uMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const dMap = new Map<string, { total: number; codes: string[] }>();
    for (const d of discounts ?? []) {
      const prev = dMap.get(d.order_id) ?? { total: 0, codes: [] };
      prev.total += Number(d.discount_try ?? 0);
      if (d.code_snapshot) prev.codes.push(d.code_snapshot);
      dMap.set(d.order_id, prev);
    }

    const out: AdminOrderRow[] = list.map((o) => {
      const p = o.product_id ? pMap.get(o.product_id) : null;
      const u = o.user_id ? uMap.get(o.user_id) : null;
      const d = dMap.get(o.id);
      const gross = Number(o.price_try ?? 0);
      const disc = d?.total ?? 0;
      return {
        id: o.id,
        reference_code: o.reference_code,
        status: o.status,
        price_try: gross,
        discount_try: disc,
        net_try: Math.max(0, gross - disc),
        discount_codes: d?.codes ?? [],
        paid_with: o.paid_with,
        created_at: o.created_at,
        approved_at: o.approved_at,
        user_note: o.user_note,
        admin_note: o.admin_note,
        receipt_path: o.receipt_path,
        external_order_id: o.external_order_id,
        external_status: o.external_status,
        external_delivery_data: o.external_delivery_data,
        checkout_fields: o.checkout_fields ?? null,
        product_id: o.product_id,
        product_name: p?.name ?? null,
        product_source: p?.source ?? null,
        manual_fulfillment: !!p?.manual_fulfillment,
        user_id: o.user_id,
        buyer_email: u?.email ?? null,
        buyer_name: u?.display_name ?? null,
      };
    });

    return { rows: out, total: count ?? out.length, page: data.page, perPage: data.perPage };
  });

export const getOrderKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const dayAgo = new Date(Date.now() - 864e5).toISOString();

    const [{ count: waiting }, { data: today }, { data: recentApproved }] = await Promise.all([
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).in("status", ["pending", "reviewing"]),
      supabaseAdmin.from("orders").select("price_try, status, created_at").gte("created_at", dayAgo),
      supabaseAdmin
        .from("orders")
        .select("created_at, approved_at")
        .eq("status", "approved")
        .not("approved_at", "is", null)
        .order("approved_at", { ascending: false })
        .limit(50),
    ]);

    const todayRows = today ?? [];
    const approvedToday = todayRows.filter((o) => o.status === "approved");
    const revenueToday = approvedToday.reduce((s, o) => s + Number(o.price_try ?? 0), 0);

    let avgMinutes = 0;
    const durations = (recentApproved ?? [])
      .map((o) => (new Date(o.approved_at as string).getTime() - new Date(o.created_at).getTime()) / 60000)
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (durations.length) avgMinutes = durations.reduce((a, b) => a + b, 0) / durations.length;

    return {
      waiting: waiting ?? 0,
      ordersToday: todayRows.length,
      approvedToday: approvedToday.length,
      revenueToday,
      avgApproveMinutes: Math.round(avgMinutes),
    };
  });

export const getOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Sipariş bulunamadı");

    const userId = order.user_id as string | null;

    const [
      { data: keys },
      { data: discounts },
      { data: audit },
      { data: profile },
      { data: wallet },
      { data: userOrders },
      { data: txns },
      { data: product },
    ] = await Promise.all([
      supabaseAdmin
        .from("order_keys")
        .select("delivered_at, license_keys(id, key_value, status, expires_at, hwid, activated_at, duration_days)")
        .eq("order_id", data.orderId),
      supabaseAdmin.from("order_discounts").select("code_snapshot, discount_try").eq("order_id", data.orderId),
      supabaseAdmin
        .from("admin_audit_log")
        .select("action, actor_email, metadata, created_at")
        .eq("entity_id", data.orderId)
        .order("created_at", { ascending: true }),
      userId
        ? supabaseAdmin.from("profiles").select("id, email, display_name, created_at, tier, total_points").eq("id", userId).maybeSingle()
        : Promise.resolve({ data: null }),
      userId
        ? supabaseAdmin.from("wallets").select("balance_try").eq("user_id", userId).maybeSingle()
        : Promise.resolve({ data: null }),
      userId
        ? supabaseAdmin
            .from("orders")
            .select("id, reference_code, status, price_try, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(6)
        : Promise.resolve({ data: [] }),
      supabaseAdmin
        .from("wallet_transactions")
        .select("kind, amount_try, note, created_at")
        .eq("order_id", data.orderId)
        .order("created_at", { ascending: true }),
      order.product_id
        ? supabaseAdmin.from("products").select("id, name, source, delivery_type, price_try").eq("id", order.product_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const allOrders = userOrders ?? [];
    const spent = allOrders.filter((o) => o.status === "approved").reduce((s, o) => s + Number(o.price_try ?? 0), 0);

    return {
      order: {
        id: order.id as string,
        reference_code: order.reference_code as string,
        status: order.status as string,
        price_try: Number(order.price_try ?? 0),
        paid_with: (order.paid_with as string) ?? null,
        created_at: order.created_at as string,
        approved_at: (order.approved_at as string) ?? null,
        updated_at: (order.updated_at as string) ?? null,
        user_note: (order.user_note as string) ?? null,
        admin_note: (order.admin_note as string) ?? null,
        receipt_path: (order.receipt_path as string) ?? null,
        checkout_fields: (order.checkout_fields as Record<string, string>) ?? null,
        external_order_id: (order.external_order_id as string) ?? null,
        external_status: (order.external_status as string) ?? null,
        external_delivery_data: (order.external_delivery_data as string) ?? null,
        client_ip: (order.client_ip as string) ?? null,
        product_id: (order.product_id as string) ?? null,
        user_id: userId,
      },
      product: product ?? null,
      keys: (keys ?? []).map((k) => {
        const lk = (k as { license_keys: unknown }).license_keys as {
          id: string; key_value: string; status: string; expires_at: string | null;
          hwid: string | null; activated_at: string | null; duration_days: number | null;
        } | null;
        return { delivered_at: (k as { delivered_at: string | null }).delivered_at, key: lk };
      }),
      discounts: (discounts ?? []).map((d) => ({
        code: (d.code_snapshot as string) ?? "indirim",
        amount: Number(d.discount_try ?? 0),
      })),
      transactions: (txns ?? []).map((t) => ({
        kind: t.kind as string,
        amount_try: Number(t.amount_try ?? 0),
        note: (t.note as string) ?? null,
        created_at: t.created_at as string,
      })),
      audit: (audit ?? []).map((a) => ({
        action: a.action as string,
        actor_email: (a.actor_email as string) ?? null,
        created_at: a.created_at as string,
        metadata: (a.metadata as Record<string, unknown>) ?? null,
      })),
      customer: profile
        ? {
            id: profile.id as string,
            email: (profile.email as string) ?? null,
            display_name: (profile.display_name as string) ?? null,
            created_at: profile.created_at as string,
            tier: (profile.tier as string) ?? null,
            total_points: Number(profile.total_points ?? 0),
            balance_try: Number((wallet as { balance_try?: number } | null)?.balance_try ?? 0),
            order_count: allOrders.length,
            total_spent: spent,
            recent_orders: allOrders.map((o) => ({
              id: o.id as string,
              reference_code: o.reference_code as string,
              status: o.status as string,
              price_try: Number(o.price_try ?? 0),
              created_at: o.created_at as string,
            })),
          }
        : null,
    };
  });

export const setOrderAdminNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid(), note: z.string().max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ admin_note: data.note || null, updated_at: new Date().toISOString() })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const manualDeliverOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        payload: z.string().min(1).max(5000),
        note: z.string().max(500).optional(),
        durationDays: z.number().int().min(1).max(3650).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.rpc("admin_manual_deliver", {
      _order_id: data.orderId,
      _payload: data.payload,
      _note: data.note ?? null,
      _duration_days: data.durationDays ?? null,
      // biome-ignore lint/suspicious/noExplicitAny: rpc typing
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const partialRefundOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orderId: z.string().uuid(), amount: z.number().positive(), note: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: res, error } = await supabase.rpc("admin_partial_refund", {
      _order_id: data.orderId,
      _amount: data.amount,
      _note: data.note ?? null,
      // biome-ignore lint/suspicious/noExplicitAny: rpc typing
    } as any);
    if (error) throw new Error(error.message);
    return res as { ok: boolean; refunded_try: number; balance_after: number; remaining_refundable: number };
  });

export const changeOrderProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orderId: z.string().uuid(), productId: z.string().uuid(), note: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: res, error } = await supabase.rpc("admin_change_order_product", {
      _order_id: data.orderId,
      _product_id: data.productId,
      _note: data.note ?? null,
      // biome-ignore lint/suspicious/noExplicitAny: rpc typing
    } as any);
    if (error) throw new Error(error.message);
    return res as { ok: boolean; wallet_delta: number };
  });

export const messageOrderCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("user_id, reference_code")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order?.user_id) throw new Error("Sipariş sahibi bulunamadı");
    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id: order.user_id,
      type: "order",
      title: data.title,
      body: data.body,
      link: "/hesabim",
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("log_admin_action", {
      _action: "order.message_customer",
      _entity_type: "order",
      _entity_id: data.orderId,
      _before: null,
      _after: { title: data.title },
      _metadata: { reference: order.reference_code },
      // biome-ignore lint/suspicious/noExplicitAny: rpc typing
    } as any);
    return { ok: true };
  });

export const listProductOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("products")
      .select("id, name, price_try, active")
      .order("name", { ascending: true });
    return (data ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      price_try: Number(p.price_try ?? 0),
      active: !!p.active,
    }));
  });
