import { createFileRoute } from "@tanstack/react-router";
import { mysqlQuery } from "@/lib/mysql.server";

function ts(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export const Route = createFileRoute("/api/public/hooks/campaign-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let due: Array<{
          id: string;
          title: string;
          body: string | null;
          image_url: string | null;
          product_name: string | null;
          product_slug: string | null;
          product_image_url: string | null;
        }>;
        try {
          due = await mysqlQuery(
            `SELECT c.id, c.title, c.body, c.image_url,
                    p.name AS product_name, p.slug AS product_slug, p.image_url AS product_image_url
               FROM campaigns c
               LEFT JOIN products p ON p.id = c.product_id
              WHERE c.status = 'scheduled'
                AND c.scheduled_at <= ?
              ORDER BY c.scheduled_at ASC
              LIMIT 10`,
            [ts()],
          );
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }

        const tg = await import("@/lib/telegram.server");
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const c of due) {
          const r = await tg.postToChannel(
            tg.campaignPayload({
              title: c.title,
              body: c.body,
              imageUrl: c.image_url ?? c.product_image_url ?? null,
              productSlug: c.product_slug ?? null,
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
