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
 * Lovable AI Gateway (OpenAI uyumlu) üzerinden çalışır.
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
- Emin değilsen retail_price_try için makul aralık ortası ver, confidence düşür.

SADECE geçerli JSON döndür, açıklama yazma:
{"retail_price_try": number, "duration_label": string, "source_url": string, "confidence": number, "reasoning": string}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI Gateway [${res.status}]: ${t}`);
    }
    const j = await res.json();
    const content = j?.choices?.[0]?.message?.content ?? "{}";
    let parsed: {
      retail_price_try?: number;
      duration_label?: string;
      source_url?: string;
      confidence?: number;
      reasoning?: string;
    } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("AI cevabı çözümlenemedi.");
    }

    return {
      retail_price_try: Number(parsed.retail_price_try ?? 0) || null,
      duration_label: (parsed.duration_label ?? "").toString().slice(0, 40) || null,
      source_url: (parsed.source_url ?? "").toString().slice(0, 500) || null,
      confidence: Number(parsed.confidence ?? 0) || 0,
      reasoning: (parsed.reasoning ?? "").toString().slice(0, 400),
    };
  });
