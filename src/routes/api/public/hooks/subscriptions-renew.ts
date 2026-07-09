import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/subscriptions-renew")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Validate anon key header (pg_cron sends this)
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("process_due_subscriptions" as never);
          if (error) {
            console.error("[cron] process_due_subscriptions", error.message);
            return Response.json({ ok: false, error: error.message }, { status: 500 });
          }
          const row = Array.isArray(data) ? (data[0] as { processed: number; succeeded: number; failed: number }) : null;

          // Best-effort Telegram summary
          if (row && (row.processed ?? 0) > 0) {
            try {
              const { notifyTelegram } = await import("@/lib/telegram.server");
              await notifyTelegram(
                `🔁 <b>Abonelik yenileme</b>\nİşlenen: ${row.processed}\nBaşarılı: ${row.succeeded}\nBaşarısız: ${row.failed}`,
              );
            } catch {
              /* ignore */
            }
          }

          return Response.json({ ok: true, ...row });
        } catch (e) {
          console.error("[cron] subscriptions-renew", (e as Error).message);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
