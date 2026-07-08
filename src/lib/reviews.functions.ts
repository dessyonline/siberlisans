import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const upsertInput = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export const upsertReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
      .from("product_reviews" as any)
      .upsert(
        {
          product_id: data.productId,
          user_id: userId,
          rating: data.rating,
          comment: data.comment ?? null,
        },
        { onConflict: "product_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: table not yet in generated types
      .from("product_reviews" as any)
      .delete()
      .eq("product_id", data.productId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
