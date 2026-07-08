import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const oneInput = z.object({ orderId: z.string().uuid() });

/** Tek bir siparişi Uniquelisans'tan yeniden sorgulayıp durumu günceller. */
export const syncUniquelisansOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => oneInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { reconcileUniquelisansOrder } = await import("@/lib/uniquelisans-sync.server");
    return await reconcileUniquelisansOrder(supabase, data.orderId);
  });

/** Bekleyen tüm UL siparişlerini toplu senkronize eder (admin manuel). */
export const syncAllPendingUniquelisans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Yetkisiz.");
    const { reconcileAllPendingUniquelisans } = await import("@/lib/uniquelisans-sync.server");
    return await reconcileAllPendingUniquelisans(supabase, 100);
  });
