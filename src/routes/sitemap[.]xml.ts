import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const BASE_URL = "https://siberlisans.lovable.app";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticEntries: SitemapEntry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/urunler", changefreq: "daily", priority: "0.9" },
          { path: "/blog", changefreq: "weekly", priority: "0.7" },
          { path: "/nasil-calisir", changefreq: "monthly", priority: "0.6" },
          { path: "/sss", changefreq: "monthly", priority: "0.6" },
          { path: "/iletisim", changefreq: "monthly", priority: "0.5" },
          { path: "/kvkk", changefreq: "yearly", priority: "0.3" },
          { path: "/gizlilik", changefreq: "yearly", priority: "0.3" },
          { path: "/iade", changefreq: "yearly", priority: "0.3" },
          { path: "/kosullar", changefreq: "yearly", priority: "0.3" },
        ];

        const entries: SitemapEntry[] = [...staticEntries];

        try {
          const supabase = createClient<Database>(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
          );
          const [productsRes, blogsRes] = await Promise.all([
            supabase.from("products").select("slug, created_at, category").eq("active", true),
            supabase
              // biome-ignore lint/suspicious/noExplicitAny: table types may lag
              .from("blog_posts" as any)
              .select("slug, published_at, updated_at")
              .not("published_at", "is", null)
              .lte("published_at", new Date().toISOString()),
          ]);
          for (const p of productsRes.data ?? []) {
            entries.push({
              path: `/urun/${p.slug}`,
              lastmod: (p.created_at ?? "").slice(0, 10) || undefined,
              changefreq: "weekly",
              priority: "0.8",
            });
          }
          const seenCat = new Set<string>();
          for (const p of productsRes.data ?? []) {
            if (p.category && !seenCat.has(p.category)) {
              seenCat.add(p.category);
              entries.push({
                path: `/urunler?kategori=${encodeURIComponent(p.category)}`,
                changefreq: "weekly",
                priority: "0.6",
              });
            }
          }
          for (const b of (blogsRes.data ?? []) as Array<{ slug: string; published_at: string | null; updated_at: string | null }>) {
            entries.push({
              path: `/blog/${b.slug}`,
              lastmod: ((b.updated_at ?? b.published_at) ?? "").slice(0, 10) || undefined,
              changefreq: "monthly",
              priority: "0.7",
            });
          }
        } catch {
          // Fall back to static entries on any error.
        }


        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
