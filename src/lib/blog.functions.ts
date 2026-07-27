import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz");
    // biome-ignore lint/suspicious/noExplicitAny: new table not in generated types
    const table = supabase.from("blog_posts" as any);
    if (data.id) {
      const { id, ...rest } = data;
      const { error } = await table.update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await table.insert({ ...data, author_id: userId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const deleteInput = z.object({ id: z.string().uuid() });
export const adminDeleteBlogPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Yetkisiz");
    // biome-ignore lint/suspicious/noExplicitAny: new table
    const { error } = await supabase.from("blog_posts" as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- AI destekli SEO blog motoru ----

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "openai/gpt-5.5";

async function callGateway(system: string, user: string) {
  const key = process.env.LOVABLE_API_KEY;
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

// biome-ignore lint/suspicious/noExplicitAny: shared supabase client type
async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Yetkisiz");
}

export const adminSuggestBlogTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: products } = await supabase
      .from("products")
      .select("name, slug, category, price_try")
      .eq("active", true)
      .order("orders_count", { ascending: false })
      .limit(25);

    const { data: posts } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: new table
      .from("blog_posts" as any)
      .select("title")
      .order("created_at", { ascending: false })
      .limit(30);

    const out = await callGateway(
      "Türkçe SEO editörüsün. Dijital lisans/yazılım satan bir e-ticaret sitesi için arama hacmi yüksek, satın alma niyetli blog konuları üretirsin. Sadece JSON döndür.",
      `Katalog: ${JSON.stringify(products ?? [])}
Mevcut yazı başlıkları (tekrarlama): ${JSON.stringify(((posts ?? []) as unknown as Array<{ title?: string }>).map((p) => p.title))}

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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => genInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: products } = await supabase
      .from("products")
      .select("name, slug, category, price_try")
      .eq("active", true)
      .order("orders_count", { ascending: false })
      .limit(20);

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
    const { data: existing } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: new table
      .from("blog_posts" as any)
      .select("slug")
      .like("slug", `${slug}%`);
    const existingSlugs = ((existing ?? []) as unknown as Array<{ slug: string }>).map((p) => p.slug);
    if (existingSlugs.includes(slug)) {
      slug = `${slug}-${existingSlugs.length + 1}`.slice(0, 140);
    }

    const { data: inserted, error } = await supabase
      // biome-ignore lint/suspicious/noExplicitAny: new table
      .from("blog_posts" as any)
      .insert({
        slug,
        title,
        excerpt,
        content,
        tags,
        author_id: userId,
        published_at: data.publish ? new Date().toISOString() : null,
      })
      .select("id, slug, title")
      .single();
    if (error) throw new Error(error.message);

    return inserted as unknown as { id: string; slug: string; title: string };
  });
