import { createFileRoute } from "@tanstack/react-router";
import { sendPushToUser } from "@/lib/web-push.server";

/**
 * Tick: her dakika çağrılır, son 10 dakikada oluşturulmuş
 * `pushed_at IS NULL` bildirimleri web push olarak gönderir.
 * Public bir endpoint — anon apikey ile korunur.
 */
export const Route = createFileRoute("/api/public/hooks/push-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin
          .from("notifications")
          .select("id, user_id, title, body, link")
          .is("pushed_at", null)
          .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
          .limit(100);

        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!rows || rows.length === 0) return Response.json({ processed: 0 });

        let sent = 0;
        for (const n of rows) {
          const r = await sendPushToUser(n.user_id, {
            title: n.title || "SiberLisans",
            body: (n.body || "").slice(0, 180),
            url: n.link || "/hesabim",
            tag: n.id,
          });
          if (r.sent > 0) sent += r.sent;
          await supabaseAdmin
            .from("notifications")
            .update({ pushed_at: new Date().toISOString() })
            .eq("id", n.id);
        }
        return Response.json({ processed: rows.length, sent });
      },
    },
  },
});
