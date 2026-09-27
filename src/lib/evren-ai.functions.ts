import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware.server";
import { z } from "zod";
import { mysqlOne } from "./mysql.server";

const EVREN_API_KEY = process.env.EVREN_API_KEY || "";
const EVREN_API_BASE_URL = process.env.EVREN_API_URL || "https://api.evren.ai/v1";

const AIRequestSchema = z.object({
  prompt: z.string(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string()
  })).optional().default([]),
  isDeepAnalysis: z.boolean().optional().default(false)
});

type AIRequest = z.infer<typeof AIRequestSchema>;

async function callEvrenAPI(model: string, messages: any[], temperature = 0.3) {
  const response = await fetch(`${EVREN_API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${EVREN_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`EVREN API Hatası (${model}):`, errorText);
    throw new Error(`API Hatası: ${response.status}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content || "";
}

export const askEvrenAI = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((data: unknown) => AIRequestSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { prompt, history, isDeepAnalysis } = data;

    // CyberLab paket yetkisi kontrolü
    const row = await mysqlOne<{ expires_at: string | null }>(
      "SELECT expires_at FROM app_access WHERE user_id=? AND app_slug=?",
      [context.userId, "cyberlab"]
    );
    
    const lifetime = row ? !row.expires_at : false;
    const active = row ? (lifetime || new Date(row.expires_at as string).getTime() > Date.now()) : false;

    if (!active) {
      return {
        success: false,
        error: "CyberLab AI Asistan'ı kullanabilmek için aktif bir CyberLab paketine sahip olmalısınız.",
        modelUsed: "Sistem"
      };
    }

    if (!EVREN_API_KEY) {
      throw new Error("EVREN API Anahtarı eksik.");
    }

    try {
      // Adım 1: Sınıflandırma ve Güvenlik Filtresi
      const guardPrompt = `Aşağıdaki kullanıcı girdisini analiz et. 
Sadece "SIBER_GUVENLIK", "GENEL", "ZARARLI" kelimelerinden birini dön. 
Girdi: "${prompt}"`;
      
      const classification = await callEvrenAPI("qwen3-guard-4b", [{ role: "user", content: guardPrompt }]);
      
      if (classification.includes("ZARARLI")) {
        return {
          success: false,
          error: "Bu istek güvenlik politikalarımıza aykırıdır.",
          modelUsed: "qwen3-guard-4b"
        };
      }

      // Adım 2: Model Seçimi
      let targetModel = "qwen3.8-flash-next"; // Varsayılan genel ve hızlı
      
      if (classification.includes("SIBER_GUVENLIK") || isDeepAnalysis) {
        targetModel = isDeepAnalysis ? "glm-5.3" : "deepseek-v4.1-flash";
      }

      const messages = [
        { role: "system", content: "Sen CyberLab platformunun uzman siber güvenlik asistanısın. Mümkün olduğunca detaylı ve eğitici cevaplar ver." },
        ...history,
        { role: "user", content: prompt }
      ];

      const reply = await callEvrenAPI(targetModel, messages, isDeepAnalysis ? 0.7 : 0.3);

      let displayModelName = targetModel;
      if (targetModel === "deepseek-v4.1-flash") displayModelName = "Claude 3.5 Sonnet (Güvenlik)";
      else if (targetModel === "glm-5.3") displayModelName = "Claude 3.5 Opus (Derin Analiz)";
      else if (targetModel === "qwen3.8-flash-next") displayModelName = "Claude 3.5 Haiku (Hızlı)";

      return {
        success: true,
        reply,
        modelUsed: displayModelName
      };
    } catch (error: any) {
      console.error("AI Request failed:", error);
      return {
        success: false,
        error: error.message || "Bir hata oluştu."
      };
    }
  });
