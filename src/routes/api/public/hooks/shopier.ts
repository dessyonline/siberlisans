import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { mysqlQuery, mysqlOne, num } from "@/lib/mysql.server";
import { assignKeyToOrder } from "@/lib/license-mysql.server";

function ts(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function uid(): string {
  return crypto.randomUUID();
}

type ApproveResult = { order_id: string | null; matched: boolean; already: boolean };

/** Ports `approve_shopier_order` (Postgres RPC, incl. tax-optimization invoice split) to MySQL. */
async function approveShopierOrder(shopierOrderId: string, buyerEmail: string, amount: number): Promise<ApproveResult> {
  const existing = await mysqlOne<{ id: string }>("SELECT id FROM orders WHERE shopier_order_id=? LIMIT 1", [shopierOrderId]);
  if (existing) {
    return { order_id: existing.id, matched: true, already: true };
  }

  const profile = await mysqlOne<{ id: string }>("SELECT id FROM profiles WHERE LOWER(email)=LOWER(?) LIMIT 1", [buyerEmail]);
  if (!profile) {
    return { order_id: null, matched: false, already: false };
  }

  const candidates = await mysqlQuery<{ id: string; price_try: string | number }>(
    `SELECT o.id,
            GREATEST(0, o.price_try - COALESCE((SELECT SUM(discount_try) FROM order_discounts WHERE order_id = o.id), 0)) AS price_try
       FROM orders o
      WHERE o.user_id = ?
        AND o.status IN ('pending','reviewing')
        AND o.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY o.created_at DESC`,
    [profile.id],
  );

  for (const c of candidates) {
    const finalPrice = num(c.price_try) ?? 0;
    if (Math.abs(finalPrice - amount) < 0.05) {
      await mysqlQuery(
        "UPDATE orders SET status='approved', approved_at=?, paid_with='shopier', shopier_order_id=?, updated_at=? WHERE id=?",
        [ts(), shopierOrderId, ts(), c.id],
      );

      const subtotal = finalPrice / 1.2;
      const vat = finalPrice - subtotal;
      const invoiceNumber =
        "SP-" + new Date().toISOString().slice(0, 7).replace("-", "") + "-" + String(Math.floor(Math.random() * 999999)).padStart(6, "0");
      try {
        await mysqlQuery(
          "INSERT INTO invoices (id,order_id,total_try,vat_amount_try,subtotal_try,vat_rate,invoice_number,created_at) VALUES (?,?,?,?,?,?,?,?)",
          [uid(), c.id, finalPrice, vat, subtotal, 20, invoiceNumber, ts()],
        );
      } catch {
        // ON CONFLICT DO NOTHING equivalent — ignore duplicate invoice errors
      }

      await assignKeyToOrder(c.id);
      return { order_id: c.id, matched: true, already: false };
    }
  }

  return { order_id: null, matched: false, already: false };
}

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

        try {
          const res = await approveShopierOrder(shopierOrderId, buyerEmail, amount);
          return new Response(JSON.stringify({ ok: true, result: res }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        } catch (e) {
          console.error("[shopier-webhook] rpc error", e);
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
