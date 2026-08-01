import { createFileRoute } from "@tanstack/react-router";
import { CORS, handleExternalVerify } from "@/lib/external-auth.server";

// Yayınlanmış sitede kimlik doğrulama katmanını atlayan harici erişim kopyası.
// Güvenlik handler içinde (API anahtarı + rate limit + şifre doğrulama) uygulanır.
export const Route = createFileRoute("/api/public/v1/auth/verify")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => handleExternalVerify(request),
    },
  },
});
