import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/campaign-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: due, error } = await supabaseAdmin
          .from("campaigns")
          .select("id,title,body,image_url,product:products(name,slug,image_url,price_try)")
          .eq("status", "scheduled")
          .lte("scheduled_at", new Date().toISOString())
          .limit(10);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const tg = await import("@/lib/telegram.server");
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const c of due ?? []) {
          const product = c.product as { name: string; slug: string; image_url: string | null; price_try: number } | null;
          const r = await tg.postToChannel(tg.campaignPayload({
            title: c.title,
            body: c.body,
            imageUrl: c.image_url ?? product?.image_url ?? null,
            productSlug: product?.slug ?? null,
          }));
          const upd = r.ok
            ? { status: "sent", sent_at: new Date().toISOString(), telegram_message_id: r.messageId ?? null, error: null }
            : { status: "failed", error: r.error ?? "bilinmeyen hata" };
          await supabaseAdmin.from("campaigns").update(upd).eq("id", c.id);
          results.push({ id: c.id, ok: r.ok, error: r.error });
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
