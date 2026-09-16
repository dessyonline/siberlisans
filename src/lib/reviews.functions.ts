import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware.server";
import { getCookie } from "@tanstack/react-start/server";

const upsertInput = z.object({
  productId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export type PublicReview = {
  id: string;
  masked_user: string;
  is_mine: boolean;
  rating: number;
  comment: string | null;
  created_at: string;
};

function mask(email: string | null, name: string | null) {
  const src = (name ?? email ?? "kullanıcı").trim();
  if (src.includes("@")) {
    const [u] = src.split("@");
    return `${u.slice(0, 2)}***`;
  }
  return src.length <= 2 ? `${src}***` : `${src.slice(0, 2)}***`;
}

/** Ürün yorumları (herkese açık). */
export const listProductReviews = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ productId: z.string() }).parse(d))
  .handler(async ({ data }): Promise<PublicReview[]> => {
    const { mysqlQuery } = await import("./mysql.server");
    const { getUserByToken, SESSION_COOKIE } = await import("./auth.server");
    const me = await getUserByToken(getCookie(SESSION_COOKIE)).catch(() => null);

    const rows = await mysqlQuery<{
      id: string;
      user_id: string | null;
      rating: number;
      comment: string | null;
      created_at: string;
      email: string | null;
      display_name: string | null;
    }>(
      `SELECT r.id, r.user_id, r.rating, r.comment, r.created_at, p.email, p.display_name
         FROM product_reviews r
         LEFT JOIN profiles p ON p.id = r.user_id
        WHERE r.product_id = ?
        ORDER BY r.created_at DESC
        LIMIT 200`,
      [data.productId],
    );

    return rows.map((r) => ({
      id: r.id,
      masked_user: mask(r.email, r.display_name),
      is_mine: !!me && me.id === r.user_id,
      rating: Number(r.rating) || 0,
      comment: r.comment,
      created_at: r.created_at,
    }));
  });

/** Kullanıcı bu ürünü satın almış mı? */
export const canReviewProduct = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ productId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { mysqlOne } = await import("./mysql.server");
    const direct = await mysqlOne<{ id: string }>(
      "SELECT id FROM orders WHERE user_id=? AND status='approved' AND product_id=? LIMIT 1",
      [context.userId, data.productId],
    );
    if (direct) return true;
    const viaItems = await mysqlOne<{ id: string }>(
      `SELECT o.id FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id=? AND o.status='approved' AND oi.product_id=? LIMIT 1`,
      [context.userId, data.productId],
    );
    return !!viaItems;
  });

export const upsertReview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { mysqlQuery, mysqlOne } = await import("./mysql.server");
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const existing = await mysqlOne<{ id: string }>(
      "SELECT id FROM product_reviews WHERE product_id=? AND user_id=? LIMIT 1",
      [data.productId, context.userId],
    );
    if (existing) {
      await mysqlQuery(
        "UPDATE product_reviews SET rating=?, comment=?, updated_at=? WHERE id=?",
        [data.rating, data.comment ?? null, now, existing.id],
      );
    } else {
      await mysqlQuery(
        `INSERT INTO product_reviews (id,product_id,user_id,rating,comment,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), data.productId, context.userId, data.rating, data.comment ?? null, now, now],
      );
    }
    return { ok: true };
  });

export const deleteMyReview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => z.object({ productId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { mysqlQuery } = await import("./mysql.server");
    await mysqlQuery("DELETE FROM product_reviews WHERE product_id=? AND user_id=?", [
      data.productId,
      context.userId,
    ]);
    return { ok: true };
  });
