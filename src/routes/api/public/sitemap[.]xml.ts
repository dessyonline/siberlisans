import { createFileRoute } from "@tanstack/react-router";
import { mysqlQuery } from "@/lib/mysql.server";

export const Route = createFileRoute("/api/public/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const base = "https://siberlisans.lovable.app";
        const [prods, posts, bundles] = await Promise.all([
          mysqlQuery<{ slug: string; updated_at: string | null }>(
            "SELECT slug, updated_at FROM products WHERE active=1",
          ),
          mysqlQuery<{ slug: string; updated_at: string | null }>(
            "SELECT slug, updated_at FROM blog_posts WHERE published_at IS NOT NULL",
          ),
          mysqlQuery<{ slug: string; created_at: string | null }>(
            "SELECT slug, created_at FROM product_bundles WHERE active=1",
          ),
        ]);
        const rows: { url: string; lastmod?: string }[] = [
          { url: "/" },
          { url: "/lisanslar" },
          { url: "/paketler" },
          { url: "/blog" },
          { url: "/iletisim" },
          { url: "/davet" },
        ];
        const push = (url: string, lastmod: string | null | undefined) => {
          if (lastmod) rows.push({ url, lastmod });
          else rows.push({ url });
        };
        for (const p of prods) push(`/urun/${p.slug}`, p.updated_at);
        for (const p of posts) push(`/blog/${p.slug}`, p.updated_at);
        for (const b of bundles) push(`/paket/${b.slug}`, b.created_at);

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
