import { createFileRoute } from "@tanstack/react-router";

/**
 * Katalog olay kuyruğunu bayi webhook'larına dağıtır (cron ile dakikalık çalışır).
 * İmza: X-SiberLisans-Signature = hex(hmac-sha256(secret, rawBody))
 */
async function sign(secret: string, body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/hooks/catalog-webhooks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apikey !== expected) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: events, error } = await supabaseAdmin
          .from("catalog_events")
          .select("id, event, payload, created_at")
          .eq("delivered", false)
          .order("id", { ascending: true })
          .limit(200);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        if (!events?.length) return Response.json({ ok: true, events: 0, sent: 0 });

        const { data: hooks } = await supabaseAdmin
          .from("dealer_webhooks")
          .select("id, url, secret, events, fail_count")
          .eq("active", true);

        let sent = 0;
        let failed = 0;

        for (const h of hooks ?? []) {
          const wanted = (h.events ?? []).includes("*")
            ? events
            : events.filter((e) => (h.events ?? []).includes(e.event) || (h.events ?? []).includes("product.updated"));
          if (!wanted.length) continue;

          const body = JSON.stringify({
            sent_at: new Date().toISOString(),
            events: wanted.map((e) => ({ id: e.id, type: e.event, data: e.payload, at: e.created_at })),
          });

          let status = 0;
          try {
            const res = await fetch(h.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-SiberLisans-Signature": await sign(h.secret, body),
                "User-Agent": "SiberLisans-Webhook/1.0",
              },
              body,
            });
            status = res.status;
          } catch {
            status = 0;
          }

          const ok = status >= 200 && status < 300;
          if (ok) sent++;
          else failed++;

          const nextFail = ok ? 0 : (h.fail_count ?? 0) + 1;
          await supabaseAdmin
            .from("dealer_webhooks")
            .update({
              last_status: status,
              last_sent_at: new Date().toISOString(),
              fail_count: nextFail,
              ...(nextFail >= 10 ? { active: false } : {}),
            })
            .eq("id", h.id);
        }

        await supabaseAdmin
          .from("catalog_events")
          .update({ delivered: true })
          .in("id", events.map((e) => e.id));

        return Response.json({ ok: true, events: events.length, sent, failed });
      },
    },
  },
});
