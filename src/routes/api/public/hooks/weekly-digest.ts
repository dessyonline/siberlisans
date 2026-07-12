import { createFileRoute } from "@tanstack/react-router";

/**
 * Weekly digest — creates in-app notifications for users who have:
 *   - active flash sales on their favorite products, OR
 *   - back-in-stock favorites, OR
 *   - unread points/tier progression.
 * Called by pg_cron once per week.
 */
export const Route = createFileRoute("/api/public/hooks/weekly-digest")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Users with digest enabled & at least one favorite
        const { data: users } = await supabaseAdmin
          .from("profiles")
          .select("id, weekly_digest_enabled")
          .eq("weekly_digest_enabled", true)
          .limit(2000);

        if (!users || users.length === 0) {
          return Response.json({ ok: true, processed: 0 });
        }

        const now = new Date().toISOString();
        let processed = 0;
        const notifications: Array<Record<string, unknown>> = [];
        const digestLogs: Array<Record<string, unknown>> = [];

        for (const u of users) {
          // Last digest within 6 days? skip.
          const { data: last } = await supabaseAdmin
            .from("weekly_digest_log")
            .select("sent_at")
            .eq("user_id", u.id)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (last?.sent_at) {
            const days = (Date.now() - new Date(last.sent_at).getTime()) / (1000 * 60 * 60 * 24);
            if (days < 6) continue;
          }

          // Favorites → flash sale / stock summary
          const { data: favs } = await supabaseAdmin
            .from("favorites")
            .select("product_id, products!inner(id, name, slug, stock_qty, price_try)")
            .eq("user_id", u.id)
            .limit(50);

          if (!favs || favs.length === 0) continue;

          // biome-ignore lint/suspicious/noExplicitAny: joined
          const productIds = favs.map((f: any) => f.product_id).filter(Boolean);
          const { data: flash } = await supabaseAdmin
            // biome-ignore lint/suspicious/noExplicitAny: flash_sales schema variance
            .from("flash_sales" as any)
            .select("product_id, ends_at")
            .in("product_id", productIds)
            .gte("ends_at", now);

          const flashCount = (flash as unknown as unknown[])?.length ?? 0;
          // biome-ignore lint/suspicious/noExplicitAny: joined
          const inStock = favs.filter((f: any) => (f.products?.stock_qty ?? 0) > 0).length;

          if (flashCount === 0 && inStock === 0) continue;

          const title =
            flashCount > 0
              ? `⚡ ${flashCount} favori üründe flash indirim var`
              : `📦 ${inStock} favori ürün stokta`;
          const body =
            flashCount > 0
              ? "Favorilerinden bazıları indirimde — kaçırma."
              : "Favori listendeki ürünler tekrar stokta. Şimdi sipariş ver.";

          notifications.push({
            user_id: u.id,
            type: "weekly_digest",
            title,
            body,
            link: "/favorilerim",
          });
          digestLogs.push({
            user_id: u.id,
            items_count: flashCount + inStock,
            payload: { flashCount, inStock },
          });
          processed++;
        }

        if (notifications.length > 0) {
          // biome-ignore lint/suspicious/noExplicitAny: bulk insert
          await supabaseAdmin.from("notifications").insert(notifications as any);
        }
        if (digestLogs.length > 0) {
          // biome-ignore lint/suspicious/noExplicitAny: bulk insert
          await supabaseAdmin.from("weekly_digest_log").insert(digestLogs as any);
        }


        return Response.json({ ok: true, processed });
      },
    },
  },
});
