import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/sitemap[.]xml")({
  server: {
    handlers: {
      GET: async () => {
        const base = "https://siberlisans.lovable.app";
        const s = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const [prods, posts, bundles] = await Promise.all([
          s.from("products").select("slug, updated_at").eq("active", true),
          s.from("blog_posts").select("slug, updated_at").eq("published", true),
          s.from("product_bundles").select("slug, created_at").eq("active", true),
        ]);
        const rows: { url: string; lastmod?: string }[] = [
          { url: "/" },
          { url: "/lisanslar" },
          { url: "/paketler" },
          { url: "/blog" },
          { url: "/iletisim" },
          { url: "/davet" },
        ];
        for (const p of prods.data ?? []) rows.push({ url: `/urun/${p.slug}`, lastmod: p.updated_at });
        for (const p of posts.data ?? []) rows.push({ url: `/blog/${p.slug}`, lastmod: p.updated_at });
        for (const b of bundles.data ?? []) rows.push({ url: `/paket/${b.slug}`, lastmod: b.created_at });

        const xml =
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          rows
            .map(
              (r) =>
                `<url><loc>${base}${r.url}</loc>${r.lastmod ? `<lastmod>${new Date(r.lastmod).toISOString()}</lastmod>` : ""}</url>`,
            )
            .join("\n") +
          `\n</urlset>`;
        return new Response(xml, {
          headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=1800" },
        });
      },
    },
  },
});
