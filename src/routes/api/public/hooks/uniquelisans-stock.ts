// Sık aralıklarla mevcut Uniquelisans ürünlerinin stok ve fiyatını kontrol eder.
import { createFileRoute } from "@tanstack/react-router";
import { requireCron } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/uniquelisans-stock")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCron(request);
        if (unauth) return unauth;

        try {
          const { runUniquelisansStockSync } = await import("@/lib/uniquelisans-catalog.server");
          const result = await runUniquelisansStockSync({
            markup_percent: 20,
            reactivate: true,
          });
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "content-type": "application/json" },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ ok: false, error: (error as Error).message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
