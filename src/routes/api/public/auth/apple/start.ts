import { createFileRoute } from "@tanstack/react-router";
import {
  APPLE_CALLBACK_PATH,
  APPLE_STATE_COOKIE,
  appleConfig,
  buildAppleAuthUrl,
  newAppleState,
} from "@/lib/apple-oauth.server";
import { cookieHeader } from "@/lib/google-oauth.server";

export const Route = createFileRoute("/api/public/auth/apple/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cfg = appleConfig();
        const origin = new URL(request.url).origin;
        if (!cfg) {
          return new Response(null, {
            status: 302,
            headers: { Location: `${origin}/auth?apple=unconfigured` },
          });
        }
        const state = newAppleState();
        return new Response(null, {
          status: 302,
          headers: {
            Location: buildAppleAuthUrl(cfg.clientId, `${origin}${APPLE_CALLBACK_PATH}`, state),
            "Set-Cookie": cookieHeader(APPLE_STATE_COOKIE, state, 600),
          },
        });
      },
    },
  },
});
