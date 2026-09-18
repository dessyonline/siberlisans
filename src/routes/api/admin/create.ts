// Bearer ADMIN_TOKEN korumalı: yeni lisans anahtarı üretir.
import { createFileRoute } from "@tanstack/react-router";
import { CORS, json, clientIp } from "@/lib/license-api.server";
import { mysqlOne, mysqlQuery } from "@/lib/mysql.server";
import { logEventMysql } from "@/lib/license-mysql-log.server";

function ts(d: Date = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

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

        let key_value = (payload?.key_value ?? "").toString().trim();
        if (!key_value) {
          const rnd = () => crypto.randomUUID().replace(/-/g, "");
          key_value = [
            rnd().slice(0, 5),
            rnd().slice(0, 4),
            rnd().slice(0, 4),
            rnd().slice(0, 5),
          ]
            .join("-")
            .toUpperCase();
        } else {
          key_value = key_value.toUpperCase();
        }

        const expires_at =
          duration_days && duration_days > 0
            ? ts(new Date(Date.now() + duration_days * 86400000))
            : null;
        const id = crypto.randomUUID();

        try {
          await mysqlQuery(
            `INSERT INTO license_keys (id, product_id, key_value, status, duration_days, expires_at, created_at)
             VALUES (?, ?, ?, 'available', ?, ?, ?)`,
            [id, product_id, key_value, duration_days, expires_at, ts()],
          );
        } catch (e) {
          return json({ success: false, error: (e as Error).message }, 500);
        }

        void payload?.email; // e-posta bilgisi bu adımda saklanmıyor (uyumluluk için kabul ediliyor)

        await logEventMysql({
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
