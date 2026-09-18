import { createFileRoute } from "@tanstack/react-router";
import { mysqlOne, mysqlQuery } from "@/lib/mysql.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export const Route = createFileRoute("/api/notifications")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => json({ notifications: [] }),
      POST: async ({ request }) => {
        let payload: { license_key?: string };
        try {
          payload = await request.json();
        } catch {
          return json({ notifications: [] });
        }
        const licenseKey = (payload?.license_key ?? "").toString().trim().toUpperCase();

        // Resolve license -> user_id via license_keys -> order_keys -> orders
        let userId: string | null = null;
        if (licenseKey) {
          const lk = await mysqlOne<{ id: string }>(
            "SELECT id FROM license_keys WHERE key_value=? LIMIT 1",
            [licenseKey],
          );
          if (lk?.id) {
            const ok = await mysqlOne<{ order_id: string }>(
              "SELECT order_id FROM order_keys WHERE license_key_id=? LIMIT 1",
              [lk.id],
            );
            if (ok?.order_id) {
              const ord = await mysqlOne<{ user_id: string | null }>(
                "SELECT user_id FROM orders WHERE id=? LIMIT 1",
                [ok.order_id],
              );
              userId = ord?.user_id ?? null;
            }
          }
        }

        if (!userId) return json({ notifications: [] });
        const rows = await mysqlQuery<{
          title: string;
          body: string;
          link: string | null;
          created_at: string;
        }>(
          "SELECT title, body, link, created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
          [userId],
        );

        const notifications = rows.map((r) => ({
          title: r.title,
          message: r.body,
          url: r.link ?? undefined,
          created_at: r.created_at,
        }));

        return json({ notifications });
      },
    },
  },
});
