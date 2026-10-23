import { createFileRoute } from "@tanstack/react-router";
import { mysqlExec, mysqlQuery } from "@/lib/mysql.server";
import { requireCron } from "@/lib/cron-auth.server";

function ts(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export const Route = createFileRoute("/api/public/hooks/campaign-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCron(request);
        if (unauth) return unauth;

        let due: Array<{
          id: string;
          title: string;
          body: string | null;
          image_url: string | null;
          product_name: string | null;
          product_slug: string | null;
          product_image_url: string | null;
          promo_code: string | null;
          promo_discount_type: string | null;
          promo_discount_value: number | string | null;
          promo_min_amount: number | string | null;
          promo_expires_at: string | null;
          promo_max_uses: number | string | null;
          promo_product_slug: string | null;
        }>;
        try {
          due = await mysqlQuery(
            `SELECT c.id, c.title, c.body, c.image_url,
                    p.name AS product_name, p.slug AS product_slug, p.image_url AS product_image_url,
                    pr.code AS promo_code, pr.discount_type AS promo_discount_type,
                    pr.discount_value AS promo_discount_value, pr.min_amount AS promo_min_amount,
                    pr.expires_at AS promo_expires_at, pr.max_uses AS promo_max_uses,
                    promo_product.slug AS promo_product_slug
               FROM campaigns c
               LEFT JOIN products p ON p.id = c.product_id
               LEFT JOIN promo_codes pr ON pr.id = c.promo_code_id
               LEFT JOIN products promo_product ON promo_product.id = pr.product_id
              WHERE (c.status = 'scheduled' OR (c.status = 'sending' AND c.updated_at < ?))
                AND c.scheduled_at <= ?
              ORDER BY c.scheduled_at ASC
              LIMIT 10`,
            [ts(new Date(Date.now() - 10 * 60_000)), ts()],
          );
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }

        const tg = await import("@/lib/telegram.server");
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        const staleBefore = ts(new Date(Date.now() - 10 * 60_000));
        for (const c of due) {
          const claimed = await mysqlExec(
            `UPDATE campaigns
                SET status='sending', error=NULL, updated_at=?
              WHERE id=?
                AND (status='scheduled' OR (status='sending' AND updated_at < ?))`,
            [ts(), c.id, staleBefore],
          );
          if (claimed !== 1) continue;

          const r = await tg.postToChannel(
            tg.campaignPayload({
              title: c.title,
              body: c.body,
              imageUrl: c.image_url ?? c.product_image_url ?? null,
              productSlug: c.product_slug ?? null,
              promo: c.promo_code
                ? {
                    code: c.promo_code,
                    discountType: c.promo_discount_type === "fixed" ? "fixed" : "percent",
                    discountValue: Number(c.promo_discount_value ?? 0),
                    minAmount: Number(c.promo_min_amount ?? 0),
                    expiresAt: c.promo_expires_at,
                    maxUses: c.promo_max_uses == null ? null : Number(c.promo_max_uses),
                    productSlug: c.promo_product_slug,
                  }
                : null,
            }),
          );
          if (r.ok) {
            await mysqlQuery(
              "UPDATE campaigns SET status='sent', sent_at=?, telegram_message_id=?, error=NULL, updated_at=? WHERE id=?",
              [ts(), r.messageId ?? null, ts(), c.id],
            );
          } else {
            await mysqlQuery(
              "UPDATE campaigns SET status='failed', error=?, updated_at=? WHERE id=?",
              [r.error ?? "bilinmeyen hata", ts(), c.id],
            );
          }
          results.push({ id: c.id, ok: r.ok, error: r.error });
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
