import { createFileRoute } from "@tanstack/react-router";
import { mysqlQuery } from "@/lib/mysql.server";

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

function ts(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function parseEvents(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v as string[];
  try {
    const parsed = JSON.parse(String(v));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(v).split(",").map((s) => s.trim()).filter(Boolean);
  }
}

export const Route = createFileRoute("/api/public/hooks/catalog-webhooks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apikey !== expected) return new Response("Unauthorized", { status: 401 });

        let events: Array<{ id: number | string; event: string; payload: unknown; created_at: string }>;
        try {
          events = await mysqlQuery(
            `SELECT id, event, payload, created_at FROM catalog_events
              WHERE delivered = 0
              ORDER BY id ASC
              LIMIT 200`,
          );
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
        if (!events.length) return Response.json({ ok: true, events: 0, sent: 0 });

        const hooks = await mysqlQuery<{
          id: string;
          url: string;
          secret: string;
          events: unknown;
          fail_count: number | null;
        }>("SELECT id, url, secret, events, fail_count FROM dealer_webhooks WHERE active = 1");

        let sent = 0;
        let failed = 0;

        for (const h of hooks) {
          const hEvents = parseEvents(h.events);
          const wanted = hEvents.includes("*")
            ? events
            : events.filter((e) => hEvents.includes(e.event) || hEvents.includes("product.updated"));
          if (!wanted.length) continue;

          const body = JSON.stringify({
            sent_at: new Date().toISOString(),
            events: wanted.map((e) => ({
              id: e.id,
              type: e.event,
              data: typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload,
              at: e.created_at,
            })),
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
          if (nextFail >= 10) {
            await mysqlQuery(
              "UPDATE dealer_webhooks SET last_status=?, last_sent_at=?, fail_count=?, active=0 WHERE id=?",
              [status, ts(), nextFail, h.id],
            );
          } else {
            await mysqlQuery(
              "UPDATE dealer_webhooks SET last_status=?, last_sent_at=?, fail_count=? WHERE id=?",
              [status, ts(), nextFail, h.id],
            );
          }
        }

        const ids = events.map((e) => e.id);
        if (ids.length) {
          const placeholders = ids.map(() => "?").join(",");
          await mysqlQuery(`UPDATE catalog_events SET delivered=1 WHERE id IN (${placeholders})`, ids as (string | number)[]);
        }

        return Response.json({ ok: true, events: events.length, sent, failed });
      },
    },
  },
});
