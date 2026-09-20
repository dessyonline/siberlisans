// pg_cron tarafından her 5 dakikada bir çağrılır.
// Yetki: apikey header (Supabase anon key). /api/public/* bypass'ından yararlanır.
import { createFileRoute } from "@tanstack/react-router";
import { requireCron } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/sync-uniquelisans")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCron(request);
        if (unauth) return unauth;

        try {
          const { reconcileAllPendingUniquelisans } = await import(
            "@/lib/uniquelisans-sync.server"
          );
          const res = await reconcileAllPendingUniquelisans(100);
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
