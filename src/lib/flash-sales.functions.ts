import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  discount_type: z.enum(["percent", "amount"]),
  discount_value: z.number().min(0.01).max(1000000),
  starts_at: z.string(),
  ends_at: z.string(),
  is_active: z.boolean(),
  label: z.string().max(80).nullable().optional(),
});

export const adminUpsertFlashSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz");
    // biome-ignore lint/suspicious/noExplicitAny: new table
    const table = supabase.from("flash_sales" as any);
    if (data.id) {
      const { id, ...rest } = data;
      const { error } = await table.update(rest).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await table.insert(data);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const deleteInput = z.object({ id: z.string().uuid() });
export const adminDeleteFlashSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz");
    // biome-ignore lint/suspicious/noExplicitAny: new table
    const { error } = await supabase.from("flash_sales" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
