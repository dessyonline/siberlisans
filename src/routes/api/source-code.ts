import { createFileRoute } from "@tanstack/react-router";
import { CORS, gate, json } from "@/lib/license-feature.server";

const CORS_ALL = { ...CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const SOURCE_PROXY_URL = process.env.SOURCE_PROXY_URL ?? "";

export const Route = createFileRoute("/api/source-code")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_ALL }),
      GET: async () => json({ ok: true, files: [] }),
      POST: async ({ request }) => {
        const g = await gate(request, {
          eventName: "source_code",
          rateLimit: { limit: 10, windowMs: 60_000 },
        });
        if ("response" in g) return g.response;
        const { body } = g;

        if (!SOURCE_PROXY_URL) {
          return json({ ok: true, files: [] });
        }
        const projectId = (body.projectId as string | undefined) ?? "";
        if (!projectId) return json({ ok: false, error: "projectId gerekli." });
        const target = `${SOURCE_PROXY_URL.replace(/\/$/, "")}/${projectId}/source-code`;
        try {
          const upstream = await fetch(target, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: body.projectId,
              email: body.email,
            }),
          });
          const data = (await upstream.json().catch(() => null)) as
            | { files?: Array<{ path: string; content: string }> }
            | null;
          if (!upstream.ok || !data) {
            return json({ ok: false, error: "Kaynak kod alınamadı." });
          }
          return json({ ok: true, files: data.files ?? [] });
        } catch (e) {
          return json({ ok: false, error: (e as Error).message });
        }
      },
    },
  },
});
