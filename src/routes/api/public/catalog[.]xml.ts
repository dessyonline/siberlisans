import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=600",
};

export const Route = createFileRoute("/api/public/catalog.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const base = `${url.protocol}//${url.host}`;
        const { loadCatalog, catalogToXml } = await import("@/lib/catalog-feed.server");
        const items = await loadCatalog(base, {
          category: url.searchParams.get("category") ?? undefined,
          code: url.searchParams.get("code") ?? undefined,
          limit: Number(url.searchParams.get("limit")) || undefined,
        });
        return new Response(catalogToXml(items, base), {
          headers: { "Content-Type": "application/xml; charset=utf-8", ...CORS },
        });
      },
    },
  },
});
