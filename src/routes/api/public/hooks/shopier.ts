import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Shopier webhook receiver
 *
 * Register with Shopier via POST /v1/webhooks (Bearer PAT):
 *   { "event": "order.created", "url": "https://siberlisans.lovable.app/api/public/hooks/shopier" }
 * Response includes `token` — save as SHOPIER_WEBHOOK_TOKEN secret.
 * Shopier signs the raw body with HS256 and sends header `Shopier-Signature`.
 */
export const Route = createFileRoute("/api/public/hooks/shopier")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.SHOPIER_WEBHOOK_TOKEN;
        const raw = await request.text();

        if (token) {
          const provided = request.headers.get("shopier-signature") ?? "";
          const expected = createHmac("sha256", token).update(raw).digest("hex");
          const a = Buffer.from(provided);
          const b = Buffer.from(expected);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response("invalid signature", { status: 401 });
          }
        }

        let payload: any;
        try { payload = JSON.parse(raw); } catch {
          return new Response("bad json", { status: 400 });
        }

        const event: string = payload?.event ?? payload?.type ?? "";
        const data = payload?.data ?? payload;

        // Only care about paid orders
        if (event !== "order.created" && event !== "order.fulfilled") {
          return new Response(JSON.stringify({ ignored: event }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        }

        const shopierOrderId: string | null =
          data?.id?.toString() ?? data?.order?.id?.toString() ?? null;
        const buyerEmail: string | null =
          data?.buyer?.email ?? data?.customer?.email ?? data?.email ?? null;
        const amount: number = Number(
          data?.total ?? data?.amount ?? data?.price ?? data?.grand_total ?? 0
        );

        if (!shopierOrderId || !buyerEmail || !(amount > 0)) {
          return new Response(
            JSON.stringify({ ok: false, reason: "missing_fields", event }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: res, error } = await supabaseAdmin.rpc("approve_shopier_order", {
          _shopier_order_id: shopierOrderId,
          _buyer_email: buyerEmail,
          _amount: amount,
        });

        if (error) {
          console.error("[shopier-webhook] rpc error", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ok: true, result: res }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
