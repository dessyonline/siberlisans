import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PublicPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_url: string | null;
  content: string;
  tags: string[];
  published_at: string;
};

function parseTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v !== "string" || !v.trim()) return [];
  const s = v.trim();
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.map(String);
  } catch {
    /* postgres array literal veya virgüllü liste */
  }
  return s
    .replace(/^[{[]|[\]}]$/g, "")
    .split(",")
    .map((t) => t.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

/** Yayınlanmış blog yazıları (liste). */
export const listBlogPosts = createServerFn({ method: "GET" }).handler(async (): Promise<PublicPost[]> => {
  const { mysqlQuery } = await import("./mysql.server");
  const rows = await mysqlQuery<Record<string, unknown>>(
    `SELECT id, slug, title, excerpt, cover_url, tags, published_at
       FROM blog_posts
      WHERE published_at IS NOT NULL AND published_at <= NOW()
      ORDER BY published_at DESC
      LIMIT 50`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    excerpt: (r.excerpt as string | null) ?? null,
    cover_url: (r.cover_url as string | null) ?? null,
    content: "",
    tags: parseTags(r.tags),
    published_at: String(r.published_at ?? ""),
  }));
});

/** Tek blog yazısı (yayınlanmışsa). */
export const getBlogPost = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<PublicPost | null> => {
    const { mysqlOne } = await import("./mysql.server");
    const r = await mysqlOne<Record<string, unknown>>(
      `SELECT id, slug, title, excerpt, cover_url, content, tags, published_at
         FROM blog_posts
        WHERE slug = ? AND published_at IS NOT NULL AND published_at <= NOW()
        LIMIT 1`,
      [data.slug],
    );
    if (!r) return null;
    return {
      id: String(r.id),
      slug: String(r.slug ?? ""),
      title: String(r.title ?? ""),
      excerpt: (r.excerpt as string | null) ?? null,
      cover_url: (r.cover_url as string | null) ?? null,
      content: String(r.content ?? ""),
      tags: parseTags(r.tags),
      published_at: String(r.published_at ?? ""),
    };
  });
