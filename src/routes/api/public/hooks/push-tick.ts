import { createFileRoute } from "@tanstack/react-router";
import { sendPushToUser } from "@/lib/web-push.server";
import { mysqlQuery } from "@/lib/mysql.server";

function ts(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Tick: her dakika çağrılır, son 10 dakikada oluşturulmuş
 * `pushed_at IS NULL` bildirimleri web push olarak gönderir.
 * Public bir endpoint — anon apikey ile korunur.
 */
export const Route = createFileRoute("/api/public/hooks/push-tick")({
  server: {
    handlers: {
      POST: async () => {
        let rows: Array<{ id: string; user_id: string; title: string | null; body: string | null; link: string | null }>;
        try {
          rows = await mysqlQuery(
            `SELECT id, user_id, title, body, link FROM notifications
              WHERE pushed_at IS NULL
                AND created_at >= ?
              LIMIT 100`,
            [ts(new Date(Date.now() - 10 * 60 * 1000))],
          );
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }

        if (rows.length === 0) return Response.json({ processed: 0 });

        let sent = 0;
        for (const n of rows) {
          const r = await sendPushToUser(n.user_id, {
            title: n.title || "SiberLisans",
            body: (n.body || "").slice(0, 180),
            url: n.link || "/hesabim",
            tag: n.id,
          });
          if (r.sent > 0) sent += r.sent;
          await mysqlQuery("UPDATE notifications SET pushed_at=? WHERE id=?", [ts(), n.id]);
        }
        return Response.json({ processed: rows.length, sent });
      },
    },
  },
});
