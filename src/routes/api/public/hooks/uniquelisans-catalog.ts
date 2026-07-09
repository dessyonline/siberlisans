// pg_cron tarafından günde bir kez çağrılır: tam katalog senkronu.
// Yetki: apikey header (Supabase anon key). /api/public/* bypass'ından yararlanır.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/uniquelisans-catalog")({
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
          const { runUniquelisansCatalogSync } = await import("@/lib/uniquelisans-catalog.server");
          const res = await runUniquelisansCatalogSync(supabaseAdmin as never, {
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
