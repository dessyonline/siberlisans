import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
      .from("favorites" as any)
      .select("id")
      .eq("user_id", userId)
      .eq("product_id", data.productId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
        .from("favorites" as any)
        .delete()
        .eq("user_id", userId)
        .eq("product_id", data.productId);
      if (error) throw new Error(error.message);
      return { favored: false };
    }
    const { error } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
      .from("favorites" as any)
      .insert({ user_id: userId, product_id: data.productId });
    if (error) throw new Error(error.message);
    return { favored: true };
  });

export const listMyFavoriteIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
      .from("favorites" as any)
      .select("product_id")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return {
      productIds: (data as unknown as { product_id: string }[] | null)?.map((r) => r.product_id) ?? [],
    };
  });
