import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const transferOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ orderId: z.string().uuid(), toEmail: z.string().email() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("transfer_order", {
      _order_id: data.orderId,
      _to_email: data.toEmail,
    });
    if (error) throw new Error(error.message);
    return { id };
  });
