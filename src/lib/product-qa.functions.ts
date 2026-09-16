import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth, requireAdmin } from "./auth-middleware.server";

const askInput = z.object({
  productId: z.string(),
  question: z.string().trim().min(5).max(600),
});

function now() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export type QuestionRow = {
  id: string;
  question: string;
  answer: string | null;
  created_at: string;
  answered_at: string | null;
  user_id: string;
};

/** Ürün soruları (herkese açık liste). */
export const listProductQuestions = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ productId: z.string() }).parse(d))
  .handler(async ({ data }): Promise<QuestionRow[]> => {
    const { mysqlQuery } = await import("./mysql.server");
    return mysqlQuery<QuestionRow>(
      `SELECT id, question, answer, created_at, answered_at, user_id
         FROM product_questions
        WHERE product_id = ?
        ORDER BY created_at DESC
        LIMIT 30`,
      [data.productId],
    );
  });

export const askProductQuestion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: unknown) => askInput.parse(d))
  .handler(async ({ data, context }) => {
    const { mysqlQuery, mysqlOne } = await import("./mysql.server");

    const recent = await mysqlOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM product_questions WHERE user_id=? AND created_at >= (NOW() - INTERVAL 1 HOUR)",
      [context.userId],
    );
    if (Number(recent?.c ?? 0) >= 5) {
      throw new Error("Çok fazla soru gönderdin, biraz sonra tekrar dene.");
    }

    await mysqlQuery(
      `INSERT INTO product_questions (id,product_id,user_id,question,is_public,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), data.productId, context.userId, data.question, 1, now(), now()],
    );
    return { ok: true };
  });

const answerInput = z.object({
  id: z.string(),
  answer: z.string().trim().min(1).max(2000),
  isPublic: z.boolean().optional(),
});

export const answerProductQuestion = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => answerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { mysqlQuery, mysqlOne } = await import("./mysql.server");
    const ts = now();

    await mysqlQuery(
      "UPDATE product_questions SET answer=?, answered_by=?, answered_at=?, is_public=?, updated_at=? WHERE id=?",
      [data.answer, context.userId, ts, data.isPublic === false ? 0 : 1, ts, data.id],
    );

    const row = await mysqlOne<{ user_id: string | null; product_id: string | null }>(
      "SELECT user_id, product_id FROM product_questions WHERE id=?",
      [data.id],
    );
    if (row?.user_id) {
      const product = row.product_id
        ? await mysqlOne<{ name: string; slug: string }>(
            "SELECT name, slug FROM products WHERE id=? LIMIT 1",
            [row.product_id],
          )
        : null;
      await mysqlQuery(
        `INSERT INTO notifications (id,user_id,type,title,body,link,created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [
          crypto.randomUUID(),
          row.user_id,
          "product_question",
          "Sorun cevaplandı",
          `${product?.name ?? "Ürün"} hakkındaki sorunu yanıtladık.`,
          product?.slug ? `/urun/${product.slug}` : null,
          ts,
        ],
      ).catch(() => undefined);
    }
    return { ok: true };
  });

export const deleteProductQuestion = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { mysqlQuery } = await import("./mysql.server");
    await mysqlQuery("DELETE FROM product_questions WHERE id=?", [data.id]);
    return { ok: true };
  });
