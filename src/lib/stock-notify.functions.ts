import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";

const productInput = z.object({ productId: z.string().uuid() });

export const subscribeStockNotify = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => productInput.extend({ email: z.string().trim().email().max(200).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { mysqlQuery } = await import("./mysql.server");
    await mysqlQuery(
      `INSERT INTO stock_notifications (id,user_id,product_id,email,notified_at,created_at)
       VALUES (?,?,?,?,NULL,NOW()) ON DUPLICATE KEY UPDATE email=VALUES(email),notified_at=NULL`,
      [crypto.randomUUID(),context.userId,data.productId,data.email ?? context.user.email],
    );
    return { ok: true as const };
  });

export const unsubscribeStockNotify = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => productInput.parse(input))
  .handler(async ({ data, context }) => {
    const { mysqlQuery } = await import("./mysql.server");
    await mysqlQuery("DELETE FROM stock_notifications WHERE user_id=? AND product_id=?", [context.userId,data.productId]);
    return { ok: true as const };
  });

export const isSubscribedToStock = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => productInput.parse(input))
  .handler(async ({ data, context }) => {
    const { mysqlOne } = await import("./mysql.server");
    const row = await mysqlOne<{ notified_at: string | null }>(
      "SELECT notified_at FROM stock_notifications WHERE user_id=? AND product_id=? LIMIT 1",
      [context.userId,data.productId],
    );
    return { subscribed: !!row, notified: !!row?.notified_at };
  });
