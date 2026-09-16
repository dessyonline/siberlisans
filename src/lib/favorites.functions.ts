import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";

export const toggleFavorite = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ productId: z.string() }).parse(d))
  .middleware([requireAuth])
  .handler(async ({ data, context }) => {
    const { mysqlQuery, mysqlOne } = await import("./mysql.server");
    const existing = await mysqlOne<{ id: string }>(
      "SELECT id FROM favorites WHERE user_id=? AND product_id=? LIMIT 1",
      [context.userId, data.productId],
    );
    if (existing) {
      await mysqlQuery("DELETE FROM favorites WHERE id=?", [existing.id]);
      return { favored: false };
    }
    await mysqlQuery(
      "INSERT INTO favorites (id,user_id,product_id,created_at) VALUES (?,?,?,?)",
      [
        crypto.randomUUID(),
        context.userId,
        data.productId,
        new Date().toISOString().slice(0, 19).replace("T", " "),
      ],
    );
    return { favored: true };
  });

export const listMyFavoriteIds = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { mysqlQuery } = await import("./mysql.server");
    const rows = await mysqlQuery<{ product_id: string }>(
      "SELECT product_id FROM favorites WHERE user_id=?",
      [context.userId],
    );
    return { productIds: rows.map((r) => r.product_id) };
  });
