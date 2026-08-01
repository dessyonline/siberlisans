import { createFileRoute } from "@tanstack/react-router";
import { CORS, handleExternalVerify } from "@/lib/external-auth.server";

// /api/v1/auth/verify ile birebir aynı davranan kısa alias.
export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => handleExternalVerify(request),
    },
  },
});
