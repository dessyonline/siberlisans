import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Yetkisiz.");
}

type AiSuggestion = {
  retail_price_try: number | null;
  duration_label: string | null;
  source_url: string | null;
  confidence: number;
};

async function callAiForProduct(
  apiKey: string,
  p: { name: string; description?: string | null; category?: string | null; duration?: string | null },
): Promise<AiSuggestion> {
  const prompt = `Sen bir dijital lisans/abonelik fiyat araştırmacısısın. Aşağıdaki ürünün ORİJİNAL üreticinin/satıcının kendi resmi web sitesindeki TÜRK LİRASI (TRY) cinsinden GÜNCEL perakende fiyatını, tipik lisans süresini ve kaynak URL'sini tahmin et.

Ürün: ${p.name}
Kategori: ${p.category ?? "-"}
Açıklama: ${p.description ?? "-"}
Ürün süresi (varsa): ${p.duration ?? "-"}

Kurallar:
- retail_price_try: sadece sayı, TL cinsinden yıllık/lisans fiyatı. USD ise güncel ~40 TL kuru ile TL'ye çevir.
- duration_label: kısa Türkçe etiket ("1 yıl", "ömür boyu", "6 ay", "1 ay" gibi).
- source_url: resmi üreticinin fiyat/satın alma sayfası (tam https URL).
- confidence: 0-1 arası tahmin güvenin.

SADECE geçerli JSON: {"retail_price_try": number, "duration_label": string, "source_url": string, "confidence": number}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI [${res.status}]: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  const content = j?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as Partial<AiSuggestion>;
  return {
    retail_price_try: Number(parsed.retail_price_try ?? 0) || null,
    duration_label: (parsed.duration_label ?? "").toString().slice(0, 40) || null,
    source_url: (parsed.source_url ?? "").toString().slice(0, 500) || null,
    confidence: Number(parsed.confidence ?? 0) || 0,
  };
}


/**
 * Ürün adından resmi satıcı fiyatı + süre etiketi tahmin eder.
 */
export const suggestRetailPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: p, error } = await supabase
      .from("products")
      .select("id, name, description, duration, category")
      .eq("id", data.productId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Ürün bulunamadı.");
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY yapılandırılmamış.");
    return await callAiForProduct(apiKey, p);
  });

/**
 * TOPLU: Orijinal fiyatı olmayan (veya tümü, force ile) içe aktarılmış ürünler
 * için AI önerilerini çeker ve doğrudan DB'ye yazar.
 * Küçük paralel gruplar halinde çalıştırır.
 */
export const batchSuggestRetailPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        force: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        minConfidence: z.number().min(0).max(1).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY yapılandırılmamış.");

    let q = supabase
      .from("products")
      .select("id, name, description, duration, category, price_try, retail_price_try")
      .not("external_id", "is", null);
    if (!data.force) q = q.or("retail_price_try.is.null,retail_price_try.eq.0");
    const { data: rows, error } = await q.limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return { total: 0, updated: 0, skipped: 0, failed: 0 };

    const minConf = data.minConfidence ?? 0.35;
    const CONC = 4;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i += CONC) {
      const batch = rows.slice(i, i + CONC);
      await Promise.all(
        batch.map(async (p) => {
          try {
            const r = await callAiForProduct(apiKey, p);
            // Confidence düşükse veya fiyat şu anki satıştan yüksek değilse atla
            if (
              !r.retail_price_try ||
              r.confidence < minConf ||
              r.retail_price_try <= Number(p.price_try ?? 0)
            ) {
              skipped++;
              return;
            }
            const { error: uerr } = await supabase
              .from("products")
              .update({
                retail_price_try: r.retail_price_try,
                retail_price_source_url: r.source_url,
                duration_label: r.duration_label,
                retail_price_updated_at: new Date().toISOString(),
              })
              .eq("id", p.id);
            if (uerr) {
              failed++;
              return;
            }
            updated++;
          } catch {
            failed++;
          }
        }),
      );
    }

    return { total: rows.length, updated, skipped, failed };
  });

