// Bearer ADMIN_TOKEN korumalı: yeni lisans anahtarı üretir.
import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, logEvent, clientIp } from "@/lib/license-api.server";

export const Route = createFileRoute("/api/admin/create")({
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
          return json({ success: false, error: "Yetkisiz." }, 401);
        }

        let payload: {
          product_id?: string;
          duration_days?: number;
          key_value?: string;
          email?: string;
        };
        try {
          payload = await request.json();
        } catch {
          return json({ success: false, error: "Geçersiz JSON." }, 400);
        }
        const product_id = (payload?.product_id ?? "").toString().trim();
        const duration_days = Number.isFinite(Number(payload?.duration_days))
          ? Number(payload?.duration_days)
          : 30;
        if (!product_id) {
          return json({ success: false, error: "product_id gerekli." }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("admin_create_license_key", {
          _product_id: product_id,
          _duration_days: duration_days,
          _key_value: payload?.key_value ?? null,
          _email: payload?.email ?? null,
        });
        if (error) return json({ success: false, error: error.message }, 500);
        const row = Array.isArray(data) ? data[0] : data;
        const key_value = (row as { key_value?: string })?.key_value ?? "";
        const expires_at = (row as { expires_at?: string })?.expires_at ?? null;

        await logEvent(supabaseAdmin as never, {
          license_key: key_value,
          event: "admin_create",
          ip: clientIp(request),
          user_agent: request.headers.get("user-agent") ?? "",
          detail: `product=${product_id} days=${duration_days}`,
        });

        return json({
          success: true,
          license_key: key_value,
          expires_at: expires_at ? new Date(expires_at).getTime() : null,
        });
      },
    },
  },
});
