import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/revoke")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: { hwid?: string; reason?: string };
        try {
          payload = await request.json();
        } catch {
          return json({ ok: false, error: "Geçersiz JSON." }, 400);
        }
        const hwid = (payload?.hwid ?? "").toString().trim();
        const reason = (payload?.reason ?? "").toString().trim().slice(0, 200) || "unspecified";
        if (!hwid || hwid.length < 4) {
          return json({ ok: false, error: "hwid gerekli." }, 400);
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error, count } = await supabaseAdmin
            .from("license_keys")
            .update({ revoked: true }, { count: "exact" })
            .eq("hwid", hwid);
          if (error) {
            console.error("[api/revoke] update failed", { reason, error: error.message });
            return json({ ok: false, error: error.message }, 500);
          }
          console.log("[api/revoke] revoked licenses", { hwid, reason, count });
          return json({ ok: true, revoked_count: count ?? 0 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          console.error("[api/revoke] exception", msg);
          return json({ ok: false, error: msg }, 500);
        }
      },
    },
  },
});
