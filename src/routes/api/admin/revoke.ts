// Bearer ADMIN_TOKEN korumalı: bir lisansı iptal eder.
import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, clientIp } from "@/lib/license-api.server";
import { mysqlQuery } from "@/lib/mysql.server";
import { logEventMysql } from "@/lib/license-mysql-log.server";

export const Route = createFileRoute("/api/admin/revoke")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const expected = process.env.LICENSE_ADMIN_TOKEN;
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ")
          ? auth.slice(7).trim()
          : "";
        if (!expected || !token || token !== expected) {
          return json({ ok: false, error: "Yetkisiz." }, 401);
        }

        let payload: { license_key?: string };
        try {
          payload = await request.json();
        } catch {
          return json({ ok: false, error: "Geçersiz JSON." }, 400);
        }
        const license_key = (payload?.license_key ?? "").toString().trim().toUpperCase();
        if (!license_key) {
          return json({ ok: false, error: "license_key gerekli." }, 400);
        }

        let revoked_count = 0;
        try {
          const before = await mysqlQuery<{ id: string }>(
            "SELECT id FROM license_keys WHERE UPPER(key_value)=? AND revoked=0",
            [license_key],
          );
          await mysqlQuery("UPDATE license_keys SET revoked=1 WHERE UPPER(key_value)=?", [license_key]);
          revoked_count = before.length;
        } catch (e) {
          return json({ ok: false, error: (e as Error).message }, 500);
        }

        await logEventMysql({
          license_key,
          event: "admin_revoke",
          ip: clientIp(request),
          user_agent: request.headers.get("user-agent") ?? "",
          detail: `count=${revoked_count}`,
        });

        return json({ ok: true, revoked_count });
      },
    },
  },
});
