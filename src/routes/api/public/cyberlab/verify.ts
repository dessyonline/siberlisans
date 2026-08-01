import { createFileRoute } from "@tanstack/react-router";
import { verifySsoToken } from "@/lib/cyberlab.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function handle(token: string) {
  if (!token) return json({ success: false, error: "token gerekli." }, 400);
  const claims = await verifySsoToken(token);
  if (!claims) return json({ success: false, error: "Geçersiz veya süresi dolmuş token." }, 401);
  return json({
    success: true,
    user: {
      id: claims.sub,
      email: claims.email,
      name: claims.name,
      plan: claims.plan,
      access_expires_at: claims.access_expires_at,
    },
  });
}

/** CyberLab, kullanıcıdan gelen SSO tokenını bu uca gönderip doğrular. */
export const Route = createFileRoute("/api/public/cyberlab/verify")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) =>
        handle(new URL(request.url).searchParams.get("token") ?? ""),
      POST: async ({ request }) => {
        let body: { token?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ success: false, error: "Geçersiz JSON." }, 400);
        }
        return handle((body.token ?? "").toString());
      },
    },
  },
});
