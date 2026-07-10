import { createFileRoute } from "@tanstack/react-router";
import { CORS, gate, json } from "@/lib/license-feature.server";

const CORS_ALL = { ...CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

export const Route = createFileRoute("/api/remove-watermark")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_ALL }),
      GET: async () => json({ ok: true }),
      POST: async ({ request }) => {
        const g = await gate(request, {
          eventName: "remove_watermark",
          rateLimit: { limit: 30, windowMs: 60_000 },
        });
        if ("response" in g) return g.response;
        return json({ ok: true });
      },
    },
  },
});
