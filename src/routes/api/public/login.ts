import { createFileRoute } from "@tanstack/react-router";
import { CORS, handleExternalVerify } from "@/lib/external-auth.server";

// /api/public/v1/auth/verify ile birebir aynı davranan kısa alias.
export const Route = createFileRoute("/api/public/login")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => handleExternalVerify(request),
    },
  },
});
