import { createFileRoute } from "@tanstack/react-router";
import {
  GOOGLE_CALLBACK_PATH,
  GOOGLE_STATE_COOKIE,
  buildAuthUrl,
  cookieHeader,
  googleConfig,
  newState,
} from "@/lib/google-oauth.server";

export const Route = createFileRoute("/api/public/auth/google/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cfg = googleConfig();
        const origin = new URL(request.url).origin;
        if (!cfg) {
          return new Response(null, {
            status: 302,
            headers: { Location: `${origin}/auth?google=unconfigured` },
          });
        }
        const state = newState();
        return new Response(null, {
          status: 302,
          headers: {
            Location: buildAuthUrl(cfg.clientId, `${origin}${GOOGLE_CALLBACK_PATH}`, state),
            "Set-Cookie": cookieHeader(GOOGLE_STATE_COOKIE, state, 600),
          },
        });
      },
    },
  },
});
