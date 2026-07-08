// Terkedilmiş siparişler için hatırlatma. pg_cron ile 15 dakikada bir çağrılır.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/abandonment-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const got = request.headers.get("apikey") || request.headers.get("x-api-key");
        if (!expected || !got || got !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: rows, error } = await supabaseAdmin.rpc(
            "list_abandoned_orders" as never,
            { _minutes: 15 } as never,
          );
          if (error) throw new Error(error.message);
          const list = (rows ?? []) as Array<{
            order_id: string;
            user_id: string;
            price_try: number;
            reference_code: string;
            created_at: string;
          }>;

          let sent = 0;
          let skipped = 0;

          for (const o of list) {
            // Tercih kontrolü
            const { data: pref } = await supabaseAdmin
              .from("notification_preferences" as never)
              .select("abandonment")
              .eq("user_id", o.user_id)
              .maybeSingle();
            const allow = pref ? (pref as { abandonment: boolean }).abandonment !== false : true;
            if (!allow) {
              await supabaseAdmin.rpc("mark_abandonment_notified" as never, { _order_id: o.order_id } as never);
              skipped++;
              continue;
            }

            await supabaseAdmin.from("notifications").insert({
              user_id: o.user_id,
              type: "abandonment",
              title: "Siparişini tamamlamayı unutma",
              body: `#${o.reference_code} · ₺${Number(o.price_try).toLocaleString(
                "tr-TR",
              )} — havale bekliyoruz. Kısa süreliğine %5 ekstra indirim: KOD5`,
              link: `/odeme/${o.order_id}`,
            });
            await supabaseAdmin.rpc("mark_abandonment_notified" as never, { _order_id: o.order_id } as never);
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
