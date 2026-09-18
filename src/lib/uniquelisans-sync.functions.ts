import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware.server";

const oneInput = z.object({ orderId: z.string().uuid() });

/** Tek bir siparişi Uniquelisans'tan yeniden sorgulayıp durumu günceller. */
export const syncUniquelisansOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => oneInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz.");
    const { reconcileUniquelisansOrder } = await import("@/lib/uniquelisans-sync.server");
    return await reconcileUniquelisansOrder(data.orderId);
  });

/** Bekleyen tüm UL siparişlerini toplu senkronize eder (admin manuel). */
export const syncAllPendingUniquelisans = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    if (!context.isAdmin) throw new Error("Yetkisiz.");
    const { reconcileAllPendingUniquelisans } = await import("@/lib/uniquelisans-sync.server");
    return await reconcileAllPendingUniquelisans(100);
  });
