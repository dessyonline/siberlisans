// pg_cron tarafından her 5 dakikada bir çağrılır.
// Yetki: apikey header (Supabase anon key). /api/public/* bypass'ından yararlanır.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-uniquelisans")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ||
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const got = request.headers.get("apikey") || request.headers.get("x-api-key");
        if (!expected || !got || got !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { reconcileAllPendingUniquelisans } = await import(
            "@/lib/uniquelisans-sync.server"
          );
          const res = await reconcileAllPendingUniquelisans(supabaseAdmin, 100);
          const delivered = res.outcomes.filter((o) => o.result === "delivered").length;
          const pending = res.outcomes.filter((o) => o.result === "still_pending").length;
          const errors = res.outcomes.filter((o) => o.result === "error").length;
          return new Response(
            JSON.stringify({
              ok: true,
              scanned: res.scanned,
              delivered,
              pending,
              errors,
              outcomes: res.outcomes,
            }),
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
