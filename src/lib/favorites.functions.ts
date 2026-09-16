import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ productId: z.string() }).parse(d))
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

export type FavoriteProduct = {
  id: string;
  slug: string;
  name: string;
  price_try: number;
  image_url: string | null;
  active: boolean;
};

export const listMyFavoriteProducts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<FavoriteProduct[]> => {
    const { mysqlQuery, num, bool } = await import("./mysql.server");
    const rows = await mysqlQuery<{
      id: string;
      slug: string;
      name: string;
      price_try: unknown;
      image_url: string | null;
      active: unknown;
    }>(
      `SELECT p.id, p.slug, p.name, p.price_try, p.image_url, p.active
         FROM favorites f
         JOIN products p ON p.id = f.product_id
        WHERE f.user_id = ?
        ORDER BY f.created_at DESC`,
      [context.userId],
    );
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      price_try: num(r.price_try) ?? 0,
      image_url: r.image_url,
      active: bool(r.active),
    }));
  });
