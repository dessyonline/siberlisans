import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Fiyat listesi (TRY)
const PRICES: Record<string, number> = {
  hd: 5,
  restore: 8,
  colorize: 8,
  denoise: 4,
};

const PROMPTS: Record<string, string> = {
  hd: "Enhance this image to ultra high definition. Sharpen details, increase resolution, improve clarity and lighting. Keep the exact same subject, composition and colors — do not change what is in the image, only make it crisper and higher quality.",
  restore: "Restore this old or damaged photo. Remove scratches, noise and blur. Recover lost details naturally. Keep the original subject and composition intact.",
  colorize: "Colorize this black and white image with natural, realistic colors. Keep composition and details identical.",
  denoise: "Remove noise, grain and compression artifacts from this image. Keep every detail sharp and natural.",
};

export const Route = createFileRoute("/api/enhance-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Auth
        const authHeader = request.headers.get("Authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supaUrl = process.env.SUPABASE_URL!;
        const supaKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const sb = createClient(supaUrl, supaKey, {
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (supaKey.startsWith("sb_") && h.get("Authorization") === `Bearer ${supaKey}`) {
                h.delete("Authorization");
              }
              h.set("apikey", supaKey);
              h.set("Authorization", `Bearer ${token}`);
              return fetch(input, { ...init, headers: h });
            },
          },
          auth: { persistSession: false },
        });
        const { data: userRes } = await sb.auth.getUser(token);
        if (!userRes?.user) return new Response("Unauthorized", { status: 401 });

        // 2. Payload
        const body = (await request.json().catch(() => null)) as {
          imageDataUrl?: string;
          mode?: string;
        } | null;
        if (!body?.imageDataUrl?.startsWith("data:image/")) {
          return new Response("Invalid image", { status: 400 });
        }
        const mode = (body.mode && PRICES[body.mode]) ? body.mode : "hd";
        const price = PRICES[mode];

        // 3. Cüzdanı düş (yetersizse RPC raise eder)
        const { error: chargeErr } = await sb.rpc("charge_ai_enhance", { _price_try: price });
        if (chargeErr) {
          const msg = chargeErr.message.includes("insufficient")
            ? "Yetersiz bakiye — cüzdanınıza yükleme yapın."
            : "Ücretlendirme hatası.";
          return new Response(msg, { status: 402 });
        }

        // 4. AI Gateway
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: PROMPTS[mode] },
                  { type: "image_url", image_url: { url: body.imageDataUrl } },
                ],
              },
            ],
            modalities: ["image", "text"],
            stream: true,
          }),
        });
        if (!upstream.ok || !upstream.body) {
          // Refund
          await sb.rpc("charge_ai_enhance", { _price_try: -price }).catch(() => {});
          const text = await upstream.text().catch(() => "");
          return new Response(text || "Upstream error", { status: upstream.status });
        }
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Charged-Try": String(price),
          },
        });
      },
    },
  },
});
