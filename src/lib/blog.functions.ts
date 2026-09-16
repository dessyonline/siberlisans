import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./auth-middleware.server";
import { mysqlOne, mysqlQuery } from "./mysql.server";

export type AdminBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_url: string | null;
  tags: string[];
  published_at: string | null;
  created_at: string;
};

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    return value
      .replace(/^[{[]|[\]}]$/g, "")
      .split(",")
      .map((tag) => tag.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }
  return [];
}

export const listAdminBlogPosts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<AdminBlogPost[]> => {
    const rows = await mysqlQuery<Record<string, unknown>>(
      `SELECT id, slug, title, excerpt, content, cover_url, tags, published_at, created_at
         FROM blog_posts
        ORDER BY created_at DESC`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      slug: String(row.slug ?? ""),
      title: String(row.title ?? ""),
      excerpt: (row.excerpt as string | null) ?? null,
      content: String(row.content ?? ""),
      cover_url: (row.cover_url as string | null) ?? null,
      tags: parseTags(row.tags),
      published_at: row.published_at ? String(row.published_at) : null,
      created_at: String(row.created_at ?? ""),
    }));
  });

const upsertInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(2).max(140).regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(200),
  excerpt: z.string().max(400).nullable().optional(),
  content: z.string().max(50000),
  cover_url: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
  published_at: z.string().nullable().optional(),
});

export const adminUpsertBlogPost = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      await mysqlQuery(
        `UPDATE blog_posts
            SET slug = ?, title = ?, excerpt = ?, content = ?, cover_url = ?, tags = ?, published_at = ?, updated_at = NOW()
          WHERE id = ?`,
        [data.slug, data.title, data.excerpt ?? null, data.content, data.cover_url ?? null, JSON.stringify(data.tags), data.published_at ?? null, data.id],
      );
    } else {
      await mysqlQuery(
        `INSERT INTO blog_posts
          (id, slug, title, excerpt, content, cover_url, tags, author_id, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [crypto.randomUUID(), data.slug, data.title, data.excerpt ?? null, data.content, data.cover_url ?? null, JSON.stringify(data.tags), context.userId, data.published_at ?? null],
      );
    }
    return { ok: true };
  });

const deleteInput = z.object({ id: z.string().uuid() });
export const adminDeleteBlogPost = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data }) => {
    await mysqlQuery("DELETE FROM blog_posts WHERE id = ?", [data.id]);
    return { ok: true };
  });

// ---- AI destekli SEO blog motoru ----

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "openai/gpt-5.5";

async function callGateway(system: string, user: string) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI anahtarı tanımlı değil");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) throw new Error("AI limiti doldu, birazdan tekrar dene");
  if (res.status === 402) throw new Error("AI kredisi bitti");
  if (!res.ok) throw new Error(`AI hatası (${res.status})`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = j.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI yanıtı çözümlenemedi");
    return JSON.parse(m[0]) as Record<string, unknown>;
  }
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export const adminSuggestBlogTopics = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const [products, posts] = await Promise.all([
      mysqlQuery("SELECT name, slug, category, price_try FROM products WHERE active = 1 ORDER BY orders_count DESC LIMIT 25"),
      mysqlQuery<{ title: string }>("SELECT title FROM blog_posts ORDER BY created_at DESC LIMIT 30"),
    ]);

    const out = await callGateway(
      "Türkçe SEO editörüsün. Dijital lisans/yazılım satan bir e-ticaret sitesi için arama hacmi yüksek, satın alma niyetli blog konuları üretirsin. Sadece JSON döndür.",
      `Katalog: ${JSON.stringify(products ?? [])}
Mevcut yazı başlıkları (tekrarlama): ${JSON.stringify(posts.map((p) => p.title))}

Şu formatta JSON döndür:
{"topics":[{"title":"...","keyword":"ana anahtar kelime","angle":"yazının açısı, 1 cümle"}]}
8 adet konu üret.`,
    );
    const topics = Array.isArray(out.topics) ? out.topics : [];
    return { topics: topics.slice(0, 8) as Array<{ title: string; keyword: string; angle: string }> };
  });

const genInput = z.object({
  topic: z.string().min(3).max(200),
  keyword: z.string().max(120).optional(),
  publish: z.boolean().default(false),
});

export const adminGenerateBlogPost = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => genInput.parse(d))
  .handler(async ({ data, context }) => {
    const products = await mysqlQuery(
      "SELECT name, slug, category, price_try FROM products WHERE active = 1 ORDER BY orders_count DESC LIMIT 20",
    );

    const out = await callGateway(
      "Türkçe SEO içerik yazarısın. Markdown formatında, özgün, aşırı reklamsız ama satın almaya yönlendiren blog yazıları üretirsin. Marka: SiberPHP (siberlisans.com), dijital lisans ve yazılım abonelikleri satar. Sadece JSON döndür.",
      `Konu: ${data.topic}
${data.keyword ? `Ana anahtar kelime: ${data.keyword}` : ""}

Ürün kataloğu (iç link için kullan; link biçimi /urun/SLUG):
${JSON.stringify(products ?? [])}

Kurallar:
- 700-1100 kelime, H2/H3 alt başlıklar, kısa paragraflar, en az 1 liste ve 1 tablo.
- Metin içinde 2-4 adet ilgili ürüne iç link ver: [Ürün Adı](/urun/slug)
- Sonda kısa bir "Sık Sorulan Sorular" bölümü (3 soru).
- Uydurma fiyat/istatistik verme.
- Başlık 60 karakteri, özet 155 karakteri aşmasın.

JSON formatı:
{"title":"...","slug":"turkce-karaktersiz-slug","excerpt":"...","tags":["...","..."],"content":"# markdown ..."}`,
    );

    const title = String(out.title ?? data.topic).slice(0, 200);
    let slug = slugify(String(out.slug ?? title));
    const excerpt = out.excerpt ? String(out.excerpt).slice(0, 400) : null;
    const content = String(out.content ?? "");
    if (content.length < 200) throw new Error("AI yeterli içerik üretemedi, tekrar dene");
    const tags = (Array.isArray(out.tags) ? out.tags : [])
      .map((t) => String(t).slice(0, 40))
      .filter(Boolean)
      .slice(0, 8);

    // slug çakışmasını çöz
    const existing = await mysqlQuery<{ slug: string }>("SELECT slug FROM blog_posts WHERE slug LIKE ?", [`${slug}%`]);
    const existingSlugs = existing.map((p) => p.slug);
    if (existingSlugs.includes(slug)) {
      slug = `${slug}-${existingSlugs.length + 1}`.slice(0, 140);
    }

    const id = crypto.randomUUID();
    await mysqlQuery(
      `INSERT INTO blog_posts
        (id, slug, title, excerpt, content, tags, author_id, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [id, slug, title, excerpt, content, JSON.stringify(tags), context.userId, data.publish ? new Date().toISOString() : null],
    );
    const inserted = await mysqlOne<{ id: string; slug: string; title: string }>(
      "SELECT id, slug, title FROM blog_posts WHERE id = ? LIMIT 1",
      [id],
    );
    if (!inserted) throw new Error("Blog yazısı kaydedilemedi");
    return inserted;
  });
