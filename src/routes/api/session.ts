import { createFileRoute } from "@tanstack/react-router";
import { CORS, gate, json } from "@/lib/license-feature.server";

export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const g = await gate(request, { eventName: "session" });
        if ("response" in g) return g.response;
        // Sadece lisans doğrulaması yeterli — session verisi client tarafında kalır.
        return json({ ok: true });
      },
    },
  },
});
