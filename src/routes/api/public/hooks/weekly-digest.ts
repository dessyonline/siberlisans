import { createFileRoute } from "@tanstack/react-router";
import { mysqlQuery, num, bool } from "@/lib/mysql.server";

function ts(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid(): string {
  return crypto.randomUUID();
}

/**
 * Weekly digest — creates in-app notifications for users who have:
 *   - active flash sales on their favorite products, OR
 *   - back-in-stock favorites, OR
 *   - unread points/tier progression.
 * Called by pg_cron once per week.
 */
export const Route = createFileRoute("/api/public/hooks/weekly-digest")({
  server: {
    handlers: {
      POST: async () => {
        const users = await mysqlQuery<{ id: string }>(
          "SELECT id FROM profiles WHERE weekly_digest_enabled = 1 LIMIT 2000",
        );

        if (users.length === 0) {
          return Response.json({ ok: true, processed: 0 });
        }

        const now = ts();
        let processed = 0;

        for (const u of users) {
          const last = await mysqlQuery<{ sent_at: string }>(
            "SELECT sent_at FROM weekly_digest_log WHERE user_id=? ORDER BY sent_at DESC LIMIT 1",
            [u.id],
          );
          if (last[0]?.sent_at) {
            const days = (Date.now() - new Date(last[0].sent_at).getTime()) / (1000 * 60 * 60 * 24);
            if (days < 6) continue;
          }

          const favs = await mysqlQuery<{ product_id: string; stock_qty: number | null }>(
            `SELECT f.product_id, p.stock_qty
               FROM favorites f
               JOIN products p ON p.id = f.product_id
              WHERE f.user_id=?
              LIMIT 50`,
            [u.id],
          );
          if (favs.length === 0) continue;

          const productIds = favs.map((f) => f.product_id).filter(Boolean);
          let flashCount = 0;
          if (productIds.length) {
            const placeholders = productIds.map(() => "?").join(",");
            const flash = await mysqlQuery<{ product_id: string }>(
              `SELECT product_id FROM flash_sales WHERE product_id IN (${placeholders}) AND ends_at >= ?`,
              [...productIds, now],
            );
            flashCount = flash.length;
          }
          const inStock = favs.filter((f) => (num(f.stock_qty) ?? 0) > 0).length;

          if (flashCount === 0 && inStock === 0) continue;

          const title =
            flashCount > 0
              ? `⚡ ${flashCount} favori üründe flash indirim var`
              : `📦 ${inStock} favori ürün stokta`;
          const body =
            flashCount > 0
              ? "Favorilerinden bazıları indirimde — kaçırma."
              : "Favori listendeki ürünler tekrar stokta. Şimdi sipariş ver.";

          await mysqlQuery(
            "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)",
            [uid(), u.id, "weekly_digest", title, body, "/favorilerim", now],
          );
          await mysqlQuery(
            "INSERT INTO weekly_digest_log (id,user_id,sent_at,items_count,payload) VALUES (?,?,?,?,?)",
            [uid(), u.id, now, flashCount + inStock, JSON.stringify({ flashCount, inStock })],
          );
          processed++;
        }

        return Response.json({ ok: true, processed });
      },
    },
  },
});
