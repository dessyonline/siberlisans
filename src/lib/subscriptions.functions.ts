import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SubscriptionRow = {
  id: string;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
  status: "active" | "paused" | "canceled" | "failed";
  autoRenew: boolean;
  intervalDays: number;
  priceTry: number;
  nextRenewalAt: string;
  lastRenewedAt: string | null;
  failureCount: number;
  lastOrderId: string | null;
  createdAt: string;
};

export const listMySubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        "id, product_id, status, auto_renew, interval_days, price_try, next_renewal_at, last_renewed_at, failure_count, last_order_id, created_at, product:products(name, slug)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
      id: string;
      product_id: string | null;
      status: SubscriptionRow["status"];
      auto_renew: boolean;
      interval_days: number;
      price_try: number;
      next_renewal_at: string;
      last_renewed_at: string | null;
      failure_count: number;
      last_order_id: string | null;
      created_at: string;
      product: { name: string; slug: string } | null;
    }>).map<SubscriptionRow>((r) => ({
      id: r.id,
      productId: r.product_id,
      productName: r.product?.name ?? null,
      productSlug: r.product?.slug ?? null,
      status: r.status,
      autoRenew: r.auto_renew,
      intervalDays: r.interval_days,
      priceTry: Number(r.price_try),
      nextRenewalAt: r.next_renewal_at,
      lastRenewedAt: r.last_renewed_at,
      failureCount: r.failure_count,
      lastOrderId: r.last_order_id,
      createdAt: r.created_at,
    }));
  });

const idInput = z.object({ subscriptionId: z.string().uuid() });
const toggleInput = z.object({ subscriptionId: z.string().uuid(), on: z.boolean() });

export const setSubscriptionAutoRenew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => toggleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_subscription_auto_renew" as never, {
      _sub_id: data.subscriptionId,
      _on: data.on,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_subscription" as never, {
      _sub_id: data.subscriptionId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renewSubscriptionNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    // Verify ownership
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("user_id, status")
      .eq("id", data.subscriptionId)
      .maybeSingle();
    if (!sub || sub.user_id !== context.userId) {
      throw new Error("Abonelik bulunamadı");
    }
    const { data: rows, error } = await context.supabase.rpc("renew_subscription" as never, {
      _sub_id: data.subscriptionId,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? (rows[0] as { outcome: string; order_id: string | null; license_key: string | null }) : null;
    return {
      outcome: row?.outcome ?? "error",
      orderId: row?.order_id ?? null,
      licenseKey: row?.license_key ?? null,
    };
  });
