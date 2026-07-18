import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/enhance-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { imageDataUrl, mode } = (await request.json()) as {
          imageDataUrl: string;
          mode?: "hd" | "restore" | "colorize" | "denoise";
        };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        if (!imageDataUrl?.startsWith("data:image/")) {
          return new Response("Invalid image", { status: 400 });
        }

        const promptMap: Record<string, string> = {
          hd: "Enhance this image to ultra high definition. Sharpen details, increase resolution, improve clarity and lighting. Keep the exact same subject, composition and colors — do not change what is in the image, only make it crisper and higher quality.",
          restore: "Restore this old or damaged photo. Remove scratches, noise and blur. Recover lost details naturally. Keep the original subject and composition intact.",
          colorize: "Colorize this black and white image with natural, realistic colors. Keep composition and details identical.",
          denoise: "Remove noise, grain and compression artifacts from this image. Keep every detail sharp and natural.",
        };
        const prompt = promptMap[mode ?? "hd"] ?? promptMap.hd;

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
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: imageDataUrl } },
                ],
              },
            ],
            modalities: ["image", "text"],
            stream: true,
          }),
        });
        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "Upstream error", { status: upstream.status });
        }
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
