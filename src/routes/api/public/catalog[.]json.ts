import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300",
};

export const Route = createFileRoute("/api/public/catalog.json")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const base = `${url.protocol}//${url.host}`;
        try {
          const { loadCatalog } = await import("@/lib/catalog-feed.server");
          const items = await loadCatalog(base, {
            category: url.searchParams.get("category") ?? undefined,
            q: url.searchParams.get("q") ?? undefined,
            code: url.searchParams.get("code") ?? undefined,
            limit: Number(url.searchParams.get("limit")) || undefined,
          });
          return new Response(
            JSON.stringify({ updated_at: new Date().toISOString(), count: items.length, products: items }),
            { headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } },
          );
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
