import { createFileRoute } from "@tanstack/react-router";
import { mysqlOne, mysqlQuery } from "@/lib/mysql.server";

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
          const before = await mysqlOne<{ c: number }>(
            "SELECT COUNT(*) c FROM license_keys WHERE hwid=?",
            [hwid],
          );
          const count = Number(before?.c ?? 0);
          await mysqlQuery("UPDATE license_keys SET revoked=1 WHERE hwid=?", [hwid]);
          console.log("[api/revoke] revoked licenses", { hwid, reason, count });
          return json({ ok: true, revoked_count: count });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          console.error("[api/revoke] exception", { reason, error: msg });
          return json({ ok: false, error: msg }, 500);
        }
      },
    },
  },
});
