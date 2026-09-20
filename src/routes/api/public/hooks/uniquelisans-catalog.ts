// pg_cron tarafından günde bir kez çağrılır: tam katalog senkronu.
// Yetki: apikey header (Supabase anon key). /api/public/* bypass'ından yararlanır.
import { createFileRoute } from "@tanstack/react-router";
import { requireCron } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/uniquelisans-catalog")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCron(request);
        if (unauth) return unauth;

        try {
          const { runUniquelisansCatalogSync } = await import("@/lib/uniquelisans-catalog.server");
          const res = await runUniquelisansCatalogSync({
            markup_percent: 20,
            import_new: true,
            reactivate: true,
          });
          return new Response(JSON.stringify({ ok: true, ...res }), {
            headers: { "content-type": "application/json" },
          });
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
