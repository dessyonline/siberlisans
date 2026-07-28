import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function readApiKey(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-api-key")?.trim() ?? "";
}

const orderSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  pay: z.boolean().optional(),
});

async function handle(request: Request, splat: string) {
  const path = (splat || "").replace(/^\/+|\/+$/g, "");
  const apiKey = readApiKey(request);
  if (!apiKey) return json({ error: "missing_api_key" }, 401);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: userId, error: authErr } = await supabaseAdmin.rpc("api_dealer_auth", {
    _api_key: apiKey,
  });
  if (authErr) return json({ error: "auth_failed" }, 500);
  if (!userId) return json({ error: "invalid_api_key" }, 401);

  try {
    if (request.method === "GET" && (path === "products" || path === "")) {
      const { data, error } = await supabaseAdmin.rpc("api_dealer_price_list", { _user_id: userId });
      if (error) throw error;
      return json({ products: data ?? [] });
    }

    if (request.method === "GET" && path === "balance") {
      const { data, error } = await supabaseAdmin.rpc("api_dealer_balance", { _user_id: userId });
      if (error) throw error;
      return json(data);
    }

    if (request.method === "GET" && path.startsWith("orders/")) {
      const ref = decodeURIComponent(path.slice("orders/".length));
      const { data, error } = await supabaseAdmin.rpc("api_dealer_order", {
        _user_id: userId,
        _reference: ref,
      });
      if (error) throw error;
      return json(data);
    }

    if (request.method === "POST" && path === "orders") {
      const parsed = orderSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return json({ error: "invalid_body", detail: parsed.error.issues }, 400);

      const { data: created, error: cErr } = await supabaseAdmin.rpc("api_dealer_create_order", {
        _user_id: userId,
        _product_id: parsed.data.product_id,
        _quantity: parsed.data.quantity,
      });
      if (cErr) throw cErr;
      const order = Array.isArray(created) ? created[0] : created;
      if (!order) return json({ error: "order_failed" }, 400);

      if (parsed.data.pay === false) return json({ ...order, status: "pending" });

      const { error: pErr } = await supabaseAdmin.rpc("api_dealer_pay_order", {
        _user_id: userId,
        _order_id: order.order_id,
      });
      if (pErr) {
        return json(
          { ...order, status: "pending", payment_error: (pErr as { message?: string }).message },
          402,
        );
      }

      const { data: detail } = await supabaseAdmin.rpc("api_dealer_order", {
        _user_id: userId,
        _reference: order.reference_code,
      });
      return json(detail ?? { ...order, status: "approved" });
    }

    return json({ error: "not_found" }, 404);
  } catch (e) {
    const message = (e as { message?: string })?.message ?? "unknown_error";
    return json({ error: message }, 400);
  }
}

export const Route = createFileRoute("/api/public/dealer/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => handle(request, (params as { _splat?: string })._splat ?? ""),
      POST: async ({ request, params }) => handle(request, (params as { _splat?: string })._splat ?? ""),
    },
  },
});
