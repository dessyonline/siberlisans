import { createFileRoute } from "@tanstack/react-router";
import { CORS, handleExternalVerify } from "@/lib/external-auth.server";

export const Route = createFileRoute("/api/v1/auth/verify")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => handleExternalVerify(request),
    },
  },
});
