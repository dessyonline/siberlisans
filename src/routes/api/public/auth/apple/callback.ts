import { createFileRoute } from "@tanstack/react-router";
import {
  APPLE_CALLBACK_PATH,
  APPLE_STATE_COOKIE,
  exchangeAppleCodeForIdentity,
} from "@/lib/apple-oauth.server";
import { SESSION_COOKIE, cookieHeader, sessionCookieForIdentity } from "@/lib/google-oauth.server";

function readCookie(request: Request, name: string) {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export const Route = createFileRoute("/api/public/auth/apple/callback")({
  server: {
    handlers: {
      // Apple response_mode=form_post ile POST gönderir
      POST: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const fail = (reason: string) =>
          new Response(null, { status: 302, headers: { Location: `${origin}/auth?apple=${reason}` } });

        const form = await request.formData().catch(() => null);
        if (!form) return fail("state");

        const code = form.get("code");
        const state = form.get("state");
        const userJson = form.get("user");
        const expected = readCookie(request, APPLE_STATE_COOKIE);
        if (
          typeof code !== "string" ||
          typeof state !== "string" ||
          !expected ||
          state !== expected
        ) {
          return fail("state");
        }

        const identity = await exchangeAppleCodeForIdentity(
          code,
          `${origin}${APPLE_CALLBACK_PATH}`,
          typeof userJson === "string" ? userJson : null,
        );
        if (!identity || !identity.verified) return fail("identity");

        try {
          const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
          const { token, expires } = await sessionCookieForIdentity(
            identity,
            ip?.split(",")[0]?.trim() ?? null,
          );
          const maxAge = Math.max(60, Math.floor((expires.getTime() - Date.now()) / 1000));
          const headers = new Headers({ Location: `${origin}/hesabim` });
          headers.append("Set-Cookie", cookieHeader(SESSION_COOKIE, token, maxAge));
          headers.append("Set-Cookie", cookieHeader(APPLE_STATE_COOKIE, "", 0));
          return new Response(null, { status: 302, headers });
        } catch {
          return fail("account");
        }
      },
      // Apple hata durumunda GET ile de dönebilir
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        return new Response(null, {
          status: 302,
          headers: { Location: `${origin}/auth?apple=state` },
        });
      },
    },
  },
});
