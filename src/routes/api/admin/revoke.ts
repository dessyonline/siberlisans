// Bearer ADMIN_TOKEN korumalı: bir lisansı iptal eder.
import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, logEvent, clientIp } from "@/lib/license-api.server";

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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("admin_revoke_license_key", {
          _key_value: license_key,
        });
        if (error) return json({ ok: false, error: error.message }, 500);

        await logEvent(supabaseAdmin as never, {
          license_key,
          event: "admin_revoke",
          ip: clientIp(request),
          user_agent: request.headers.get("user-agent") ?? "",
          detail: `count=${data ?? 0}`,
        });

        return json({ ok: true, revoked_count: Number(data ?? 0) });
      },
    },
  },
});
