import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const subscribeStockNotify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string; email?: string }) => {
    if (!input?.productId || typeof input.productId !== "string") {
      throw new Error("productId gerekli");
    }
    return {
      productId: input.productId,
      email: typeof input.email === "string" && input.email.includes("@")
        ? input.email.trim().slice(0, 200)
        : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("stock_notifications")
      .upsert(
        {
          user_id: userId,
          product_id: data.productId,
          email: data.email ?? null,
          notified_at: null,
        },
        { onConflict: "user_id,product_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const unsubscribeStockNotify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string }) => {
    if (!input?.productId) throw new Error("productId gerekli");
    return { productId: input.productId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("stock_notifications")
      .delete()
      .eq("user_id", userId)
      .eq("product_id", data.productId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const isSubscribedToStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string }) => {
    if (!input?.productId) throw new Error("productId gerekli");
    return { productId: input.productId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("stock_notifications")
      .select("id, notified_at")
      .eq("user_id", userId)
      .eq("product_id", data.productId)
      .maybeSingle();
    return { subscribed: !!row, notified: !!row?.notified_at };
  });
