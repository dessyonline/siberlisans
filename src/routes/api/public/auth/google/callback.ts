import { createFileRoute } from "@tanstack/react-router";
import {
  GOOGLE_CALLBACK_PATH,
  GOOGLE_STATE_COOKIE,
  SESSION_COOKIE,
  cookieHeader,
  exchangeCodeForIdentity,
  sessionCookieForIdentity,
} from "@/lib/google-oauth.server";

function readCookie(request: Request, name: string) {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export const Route = createFileRoute("/api/public/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const fail = (reason: string) =>
          new Response(null, { status: 302, headers: { Location: `${origin}/auth?google=${reason}` } });

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const expected = readCookie(request, GOOGLE_STATE_COOKIE);
        if (!code || !state || !expected || state !== expected) return fail("state");

        const identity = await exchangeCodeForIdentity(code, `${origin}${GOOGLE_CALLBACK_PATH}`);
        if (!identity || !identity.verified) return fail("identity");

        try {
          const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
          const { token, expires } = await sessionCookieForIdentity(identity, ip?.split(",")[0]?.trim() ?? null);
          const maxAge = Math.max(60, Math.floor((expires.getTime() - Date.now()) / 1000));
          const headers = new Headers({ Location: `${origin}/hesabim` });
          headers.append("Set-Cookie", cookieHeader(SESSION_COOKIE, token, maxAge));
          headers.append("Set-Cookie", cookieHeader(GOOGLE_STATE_COOKIE, "", 0));
          return new Response(null, { status: 302, headers });
        } catch {
          return fail("account");
        }
      },
    },
  },
});
