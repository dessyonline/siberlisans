import { createFileRoute } from "@tanstack/react-router";
import { CORS, gate, json } from "@/lib/license-feature.server";

// Ters-proxy: eklenti mesajını Lovable'a iletir.
// Hedef URL yapılandırılabilir; kurulmamışsa graceful hata döner.
const LOVABLE_CHAT_URL = process.env.CHAT_PROXY_URL ?? "";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const g = await gate(request, {
          eventName: "chat",
          rateLimit: { limit: 15, windowMs: 60_000 },
        });
        if ("response" in g) return g.response;
        const { body } = g;

        if (!LOVABLE_CHAT_URL) {
          return json({
            ok: true,
            response: "Lisans doğrulandı. Chat proxy yapılandırılmadı.",
            data: null,
          });
        }

        const token = (body.token as string | undefined) ?? "";
        const projectId = (body.projectId as string | undefined) ?? "";
        if (!projectId) return json({ ok: false, error: "projectId gerekli." });
        const target = `${LOVABLE_CHAT_URL.replace(/\/$/, "")}/${projectId}/chat`;
        try {
          const upstream = await fetch(target, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: "Bearer " + token } : {}),
            },
            body: JSON.stringify({
              message: body.message ?? "",
              projectId: body.projectId,
              files: body.files ?? [],
              optimisticImageUrls: body.optimisticImageUrls ?? [],
              clientGitSha: body.clientGitSha,
            }),
          });
          const contentType = upstream.headers.get("content-type") ?? "";
          const raw = contentType.includes("application/json")
            ? await upstream.json()
            : await upstream.text();
          if (!upstream.ok) {
            return json({
              ok: false,
              error:
                typeof raw === "string"
                  ? raw.slice(0, 300)
                  : (raw as { error?: string })?.error ?? "Upstream hatası.",
            });
          }
          return json({ ok: true, response: null, data: raw });
        } catch (e) {
          return json({ ok: false, error: (e as Error).message });
        }
      },
    },
  },
});
