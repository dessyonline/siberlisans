// Terkedilmiş siparişler için hatırlatma. pg_cron ile 15 dakikada bir çağrılır.
import { createFileRoute } from "@tanstack/react-router";
import { mysqlQuery, mysqlOne, num, bool } from "@/lib/mysql.server";
import { requireCron } from "@/lib/cron-auth.server";

function ts(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid(): string {
  return crypto.randomUUID();
}

export const Route = createFileRoute("/api/public/hooks/abandonment-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCron(request);
        if (unauth) return unauth;

        try {
          const list = await mysqlQuery<{
            order_id: string;
            user_id: string;
            price_try: string | number;
            reference_code: string;
            created_at: string;
          }>(
            `SELECT o.id AS order_id, o.user_id, o.price_try, o.reference_code, o.created_at
               FROM orders o
              WHERE o.status = 'pending'
                AND o.abandonment_notified_at IS NULL
                AND o.created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)
                AND o.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
                AND o.user_id IS NOT NULL
              ORDER BY o.created_at DESC
              LIMIT 200`,
          );

          let sent = 0;
          let skipped = 0;

          for (const o of list) {
            const pref = await mysqlOne<{ abandonment: number | null }>(
              "SELECT abandonment FROM notification_preferences WHERE user_id=?",
              [o.user_id],
            );
            const allow = pref ? bool(pref.abandonment ?? 1) : true;
            if (!allow) {
              await mysqlQuery("UPDATE orders SET abandonment_notified_at=? WHERE id=?", [ts(), o.order_id]);
              skipped++;
              continue;
            }

            const price = num(o.price_try) ?? 0;
            await mysqlQuery(
              "INSERT INTO notifications (id,user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?,?)",
              [
                uid(),
                o.user_id,
                "abandonment",
                "Siparişini tamamlamayı unutma",
                `#${o.reference_code} · ₺${price.toLocaleString("tr-TR")} — havale bekliyoruz. Kısa süreliğine %5 ekstra indirim: KOD5`,
                `/odeme/${o.order_id}`,
                ts(),
              ],
            );
            await mysqlQuery("UPDATE orders SET abandonment_notified_at=? WHERE id=?", [ts(), o.order_id]);
            sent++;
          }

          return new Response(
            JSON.stringify({ ok: true, scanned: list.length, sent, skipped }),
            { headers: { "content-type": "application/json" } },
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: (e as Error).message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
